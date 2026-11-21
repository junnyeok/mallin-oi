import Foundation
import SwiftUI

struct OfflineArticle: Codable, Identifiable {
    let id: Int64
    let title: String
    let body: String

    static func postID(from url: URL) -> Int64? {
        guard SiteURLs.isSitePage(url),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.percentEncodedPath == "/post.html" else {
            return nil
        }
        let ids = parts.queryItems?.filter { $0.name == "id" } ?? []
        guard ids.count == 1, let id = ids.first?.value,
              id.range(of: #"^[1-9][0-9]*$"#, options: .regularExpression) != nil else {
            return nil
        }
        return Int64(id)
    }

    static func bodyText(from body: String) -> String {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let htmlOptions: String.CompareOptions = [.regularExpression, .caseInsensitive]
        guard text.range(of: #"<[a-z][a-z0-9]*\b[^>]*>"#, options: htmlOptions) != nil else {
            return text
        }

        let plain = text
            .replacingOccurrences(of: #"<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?</\1\s*>"#,
                                  with: "", options: htmlOptions)
            .replacingOccurrences(of: #"<br\b[^>]*>|</(?:p|div|li|h[1-6]|blockquote|figure|tr|pre)\s*>"#,
                                  with: "\n", options: htmlOptions)
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)

        let entities = try! NSRegularExpression(pattern: #"&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);"#)
        let named: [String: String] = [
            "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
            "ndash": "–", "mdash": "—", "rsquo": "’", "lsquo": "‘", "rdquo": "”", "ldquo": "“", "hellip": "…",
        ]
        var decoded = plain
        for match in entities.matches(in: plain, range: NSRange(plain.startIndex..., in: plain)).reversed() {
            guard let entityRange = Range(match.range(at: 1), in: plain),
                  let matchRange = Range(match.range, in: decoded) else { continue }
            let entity = String(plain[entityRange])
            let number = entity.hasPrefix("#x")
                ? UInt32(entity.dropFirst(2), radix: 16)
                : UInt32(entity.dropFirst())
            if let replacement = named[entity] ?? number.flatMap(UnicodeScalar.init).map(String.init) {
                decoded.replaceSubrange(matchRange, with: replacement)
            }
        }
        return decoded.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct PostResponse: Decodable {
    let id: Int64
    let title: String
    let body: String?
    let isPrivate: Bool
    let isUnlocked: Bool

    enum CodingKeys: String, CodingKey {
        case id, title, body
        case isPrivate = "is_private"
        case isUnlocked = "is_unlocked"
    }
}

enum OfflineSaveError: LocalizedError {
    case unavailable, noText

    var errorDescription: String? {
        switch self {
        case .unavailable: return "공개된 글만 저장할 수 있어요."
        case .noText: return "이 글에 저장할 본문 텍스트가 없어요."
        }
    }
}

enum PublicPostService {
    private static let url = URL(string: "https://tfztkeihdqkfzwpilyky.supabase.co/rest/v1/rpc/get_post_detail")!
    // This is the same public anon key used by the website; RLS and the RPC enforce access.
    private static let publicKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmenRrZWloZHFrZnp3cGlseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDYxNjgsImV4cCI6MjA4ODQyMjE2OH0.40iiWIFS_WOcPYgbs09Me7LUXGShODO91RnQOT3SHdQ"

    static func load(id: Int64) async throws -> OfflineArticle {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 18
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publicKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(publicKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_post_id": id,
            "p_secret_password": NSNull(),
        ])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.url == url, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let rows = try JSONDecoder().decode([PostResponse].self, from: data)
        guard let row = rows.first, row.id == id, !row.isPrivate, row.isUnlocked else {
            throw OfflineSaveError.unavailable
        }
        let body = OfflineArticle.bodyText(from: row.body ?? "")
        guard !body.isEmpty else { throw OfflineSaveError.noText }
        return OfflineArticle(id: id, title: row.title, body: body)
    }
}

@MainActor
final class OfflineLibrary: ObservableObject {
    @Published private(set) var articles: [OfflineArticle] = []
    private let file: URL
    private var readError: Error?

    init(file: URL = URL.applicationSupportDirectory.appendingPathComponent("offline-articles.json")) {
        self.file = file
        do {
            let data = try Data(contentsOf: file)
            articles = try JSONDecoder().decode([OfflineArticle].self, from: data)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            // The library is created on the first save.
        } catch {
            readError = error
        }
    }

    func save(_ article: OfflineArticle) throws {
        try update([article] + articles.filter { $0.id != article.id })
    }

    func remove(at offsets: IndexSet) throws {
        var updated = articles
        updated.remove(atOffsets: offsets)
        try update(updated)
    }

    private func update(_ updated: [OfflineArticle]) throws {
        if let readError { throw readError }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(updated).write(to: file, options: .atomic)
        articles = updated
    }
}
