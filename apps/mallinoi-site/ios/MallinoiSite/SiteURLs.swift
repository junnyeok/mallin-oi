import Foundation

enum SiteURLs {
    static let host = "mallin-oi.com"
    static let home = URL(string: "https://\(host)/")!
    static let profile = home.appendingPathComponent("profile.html")
    static let authenticationCallbackScheme = "mallinoi"

    static func isProfileLink(_ url: URL) -> Bool {
        url.absoluteString == "mallinoisite://profile"
    }

    static func isSitePage(_ url: URL) -> Bool {
        url.host?.lowercased() == host && isSecureWebURL(url)
    }

    private static func isSecureWebURL(_ url: URL) -> Bool {
        url.scheme == "https" && url.user == nil && url.password == nil &&
            (url.port == nil || url.port == 443)
    }

    static func provider(for url: URL) -> String? {
        guard isSecureWebURL(url) else { return nil }
        switch (url.host, url.path) {
        case ("accounts.google.com", "/o/oauth2/v2/auth"): return "google"
        case ("kauth.kakao.com", "/oauth/authorize"): return "kakao"
        case ("appleid.apple.com", "/auth/authorize"): return "apple"
        default: return nil
        }
    }

    static func isAuthenticationURL(_ url: URL) -> Bool {
        guard let provider = provider(for: url),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let redirects = parts.queryItems?.filter { $0.name == "redirect_uri" } ?? []
        let expected = "https://tfztkeihdqkfzwpilyky.supabase.co/functions/v1/social-auth/callback/\(provider)"
        return redirects.count == 1 && redirects.first?.value == expected
    }

    static func completedRequest(from url: URL) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == authenticationCallbackScheme, parts.host == "auth",
              parts.percentEncodedPath == "/callback", parts.query == nil,
              parts.user == nil, parts.password == nil, parts.port == nil,
              let fragment = parts.percentEncodedFragment,
              let item = URLComponents(string: "?\(fragment)")?.queryItems,
              item.count == 1, item[0].name == "request", let request = item[0].value,
              UUID(uuidString: request) != nil else { return nil }
        return request
    }
}
