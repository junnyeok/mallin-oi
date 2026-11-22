import Foundation
import StoreKit

enum SiteAppUpdate {
    static let checkInterval: TimeInterval = 24 * 60 * 60
    static let retryInterval: TimeInterval = 15 * 60
    static let appStoreURL = URL(string: "https://apps.apple.com/kr/app/id6836208752")!

    private static let trackID = 6836208752
    private static let bundleID = "com.mallinoi.site"
    private static let postponedUpdateKey = "siteAppUpdatePostponement"

    private struct Lookup: Decodable {
        struct Release: Decodable {
            let trackId: Int
            let bundleId: String
            let version: String
            let minimumOsVersion: String
        }

        let results: [Release]
    }

    static func availableVersion() async throws -> String? {
        guard let installed = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String else {
            return nil
        }
        // The public listing and its update link use the Korean storefront.
        if let storefront = await Storefront.current, storefront.countryCode != "KOR" {
            return nil
        }

        let endpoint = URL(string: "https://itunes.apple.com/lookup?id=\(trackID)&country=kr&entity=software")!
        let request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let os = ProcessInfo.processInfo.operatingSystemVersion
        return try newerVersion(in: data, than: installed, osVersion: "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)")
    }

    static func newerVersion(in data: Data, than installed: String, osVersion: String) throws -> String? {
        let listing = try JSONDecoder().decode(Lookup.self, from: data)
        guard let release = listing.results.first(where: { $0.trackId == trackID && $0.bundleId == bundleID }),
              let current = versionParts(installed), let latest = versionParts(release.version),
              let actualOS = versionParts(osVersion), let minimumOS = versionParts(release.minimumOsVersion),
              current.lexicographicallyPrecedes(latest), !actualOS.lexicographicallyPrecedes(minimumOS) else {
            return nil
        }
        return release.version
    }

    private static func versionParts(_ version: String) -> [Int]? {
        let components = version.split(separator: ".", omittingEmptySubsequences: false)
        var numbers = components.compactMap { part -> Int? in
            guard part.utf8.allSatisfy({ (48...57).contains($0) }) else { return nil }
            return Int(part)
        }
        guard !numbers.isEmpty, numbers.count == components.count else { return nil }
        while numbers.last == 0 { numbers.removeLast() }
        return numbers
    }

    static func postpone(_ version: String) {
        UserDefaults.standard.set(
            ["version": version, "until": Date().addingTimeInterval(checkInterval)],
            forKey: postponedUpdateKey
        )
    }

    static func isPostponed(_ version: String) -> Bool {
        let saved = UserDefaults.standard.dictionary(forKey: postponedUpdateKey)
        guard saved?["version"] as? String == version, let until = saved?["until"] as? Date else {
            return false
        }
        return until > Date()
    }
}
