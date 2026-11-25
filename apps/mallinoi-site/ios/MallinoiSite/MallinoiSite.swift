import AuthenticationServices
import SwiftUI
import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting session: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene else { return }
        let controller = SiteViewController()
        if connectionOptions.urlContexts.contains(where: { SiteURLs.isProfileLink($0.url) }) {
            controller.openProfile()
        }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = controller
        self.window = window
        window.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        guard contexts.contains(where: { SiteURLs.isProfileLink($0.url) }) else { return }
        (window?.rootViewController as? SiteViewController)?.openProfile()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? SiteViewController)?.checkForAppUpdate()
    }
}

final class SiteViewController: UIViewController {
    private static let initialThemeColor = UIColor(red: 182 / 255, green: 216 / 255, blue: 106 / 255, alpha: 1)
    private static let themeWorld = WKContentWorld.world(name: "MallinoiSiteTheme")
    private static let themeMessage = "mallinoiTheme"

    private let library = OfflineLibrary()
    private let loading = UIActivityIndicatorView(style: .medium)
    private let connectionError = UIStackView()
    private let topTheme = UIView()
    private var scrollObservation: NSKeyValueObservation?
    private var retryRequest = URLRequest(url: SiteURLs.home)
    private var authentication: (request: String, session: ASWebAuthenticationSession)?
    private var isCheckingForAppUpdate = false
    private var nextAppUpdateCheck = Date.distantPast
    private var pendingAppUpdate: String?
    private var pageStatusBarStyle: UIStatusBarStyle = .darkContent
    private var pageHeaderTop: CGFloat = 0
    private var pageHeaderBottom: CGFloat = 0
    private var themeStatusBarStyle: UIStatusBarStyle = .darkContent

    override var preferredStatusBarStyle: UIStatusBarStyle { themeStatusBarStyle }

    private lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.limitsNavigationsToAppBoundDomains = true
        let content = configuration.userContentController
        let handler = SiteMessageHandler(controller: self)
        content.addScriptMessageHandler(handler, contentWorld: .page, name: "mallinoiSite")
        content.addScriptMessageHandler(handler, contentWorld: Self.themeWorld, name: Self.themeMessage)
        content.addUserScript(WKUserScript(
            source: Self.themeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: Self.themeWorld
        ))
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        return webView
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        topTheme.backgroundColor = Self.initialThemeColor
        topTheme.translatesAutoresizingMaskIntoConstraints = false
        topTheme.isUserInteractionEnabled = false
        view.addSubview(topTheme)
        NSLayoutConstraint.activate([
            topTheme.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            topTheme.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            topTheme.topAnchor.constraint(equalTo: view.topAnchor),
            topTheme.bottomAnchor.constraint(equalTo: safeArea.topAnchor),
        ])
        scrollObservation = webView.scrollView.observe(\.contentOffset, options: [.initial, .new]) { [weak self] _, _ in
            self?.updateTopChrome()
        }

        loading.accessibilityLabel = "말린오이닷컴을 불러오고 있어요"
        loading.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loading)
        NSLayoutConstraint.activate([
            loading.centerXAnchor.constraint(equalTo: safeArea.centerXAnchor),
            loading.centerYAnchor.constraint(equalTo: safeArea.centerYAnchor),
        ])

        configureConnectionError()
        loadSite()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        checkForAppUpdate()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateTopChrome()
    }

    func checkForAppUpdate() {
        guard viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive else { return }
        if let version = pendingAppUpdate {
            presentAppUpdate(version)
            return
        }
        guard !isCheckingForAppUpdate, Date() >= nextAppUpdateCheck else { return }

        isCheckingForAppUpdate = true
        Task { [weak self] in
            do {
                let version = try await SiteAppUpdate.availableVersion()
                guard let self else { return }
                self.isCheckingForAppUpdate = false
                self.nextAppUpdateCheck = Date().addingTimeInterval(SiteAppUpdate.checkInterval)
                if let version {
                    self.pendingAppUpdate = version
                    self.presentAppUpdate(version)
                }
            } catch {
                self?.isCheckingForAppUpdate = false
                self?.nextAppUpdateCheck = Date().addingTimeInterval(SiteAppUpdate.retryInterval)
            }
        }
    }

    private func presentAppUpdate(_ version: String) {
        guard viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive,
              presentedViewController == nil, authentication == nil else { return }
        pendingAppUpdate = nil
        guard !SiteAppUpdate.isPostponed(version) else { return }

        let alert = UIAlertController(
            title: "말린오이닷컴 업데이트",
            message: "새 버전 \(version)이 나왔어요. App Store에서 업데이트할 수 있어요.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "나중에", style: .cancel) { _ in
            SiteAppUpdate.postpone(version)
        })
        let update = UIAlertAction(title: "업데이트하기", style: .default) { _ in
            SiteAppUpdate.postpone(version)
            UIApplication.shared.open(SiteAppUpdate.appStoreURL)
        }
        alert.addAction(update)
        alert.preferredAction = update
        present(alert, animated: true)
    }

    private func configureConnectionError() {
        let title = UILabel()
        title.text = "말린오이닷컴에 연결하지 못했어요"
        title.font = .preferredFont(forTextStyle: .headline)
        title.adjustsFontForContentSizeCategory = true
        title.textAlignment = .center
        title.numberOfLines = 0

        let retry = UIButton(type: .system)
        retry.setTitle("다시 시도", for: .normal)
        retry.addAction(UIAction { [weak self] _ in self?.loadSite() }, for: .touchUpInside)

        let saved = UIButton(type: .system)
        saved.setTitle("저장된 글", for: .normal)
        saved.addAction(UIAction { [weak self] _ in _ = self?.showReader() }, for: .touchUpInside)

        [title, retry, saved].forEach(connectionError.addArrangedSubview)
        connectionError.axis = .vertical
        connectionError.spacing = 14
        connectionError.translatesAutoresizingMaskIntoConstraints = false
        connectionError.isHidden = true
        view.addSubview(connectionError)
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            connectionError.centerXAnchor.constraint(equalTo: safeArea.centerXAnchor),
            connectionError.centerYAnchor.constraint(equalTo: safeArea.centerYAnchor),
            connectionError.leadingAnchor.constraint(greaterThanOrEqualTo: safeArea.leadingAnchor, constant: 24),
            connectionError.trailingAnchor.constraint(lessThanOrEqualTo: safeArea.trailingAnchor, constant: -24),
        ])
    }

    func openProfile() {
        retryRequest = URLRequest(url: SiteURLs.profile)
        if isViewLoaded { loadSite() }
    }

    private func loadSite() {
        connectionError.isHidden = true
        if webView.isHidden {
            pageHeaderTop = 0
            pageHeaderBottom = 0
            applyPageTheme(Self.initialThemeColor, statusBarStyle: .darkContent)
        }
        webView.isHidden = false
        updateTopChrome()
        loading.startAnimating()
        webView.load(retryRequest)
    }

    private func showConnectionError() {
        loading.stopAnimating()
        webView.isHidden = true
        connectionError.isHidden = false
        updateTopChrome()
    }

    private func showReader() -> Bool {
        showSheet(OfflineReader(library: library))
    }

    private func showSheet<Content: View>(_ content: Content) -> Bool {
        guard view.window != nil, presentedViewController == nil else { return false }
        let controller = UIHostingController(rootView: content)
        controller.modalPresentationStyle = .formSheet
        present(controller, animated: true)
        return true
    }

    private func confirmTrustedOrigin(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return frame.isMainFrame && origin.protocol == "https" &&
            origin.host == SiteURLs.host && (origin.port == 0 || origin.port == 443)
    }

    fileprivate func handle(_ message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void) {
        guard message.webView === webView, confirmTrustedOrigin(message.frameInfo),
              let url = webView.url, SiteURLs.isSitePage(url),
              let body = message.body as? [String: Any] else {
            reply(nil, "UNAVAILABLE")
            return
        }
        if message.name == Self.themeMessage {
            guard !webView.isHidden, let path = body["path"] as? String,
                  path == URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath,
                  let rgb = body["rgb"] as? [Int], rgb.count == 3,
                  rgb.allSatisfy((0...255).contains),
                  let headerTop = body["headerTop"] as? Double,
                  let headerBottom = body["headerBottom"] as? Double,
                  headerTop.isFinite, headerTop >= 0,
                  headerBottom.isFinite, headerBottom >= headerTop else {
                reply(nil, "UNAVAILABLE")
                return
            }
            pageHeaderTop = CGFloat(headerTop)
            pageHeaderBottom = CGFloat(headerBottom)
            updatePageTheme(rgb)
            reply(Double(view.safeAreaInsets.bottom), nil)
            return
        }
        guard let action = body["action"] as? String else {
            reply(nil, "UNAVAILABLE")
            return
        }

        switch action {
        case "authenticate":
            guard let destination = body["url"] as? String, let url = URL(string: destination),
                  SiteURLs.isAuthenticationURL(url),
                  let request = body["request"] as? String, UUID(uuidString: request) != nil else {
                reply(nil, "PROVIDER_FAILED")
                return
            }
            authenticate(at: url, request: request, reply: reply)
        case "openGoogleAuthenticator":
            guard url.path == "/mypage.html" || url.path == "/account/mfa.html" else {
                reply(nil, "UNAVAILABLE")
                return
            }
            let authenticator = URL(string: "googleauthenticator://")!
            let store = URL(string: "itms-apps://apps.apple.com/kr/app/id388497605")!
            UIApplication.shared.open(authenticator) { opened in
                if opened {
                    reply(true, nil)
                } else {
                    UIApplication.shared.open(store) { reply($0, nil) }
                }
            }
        case "openOfflineLibrary":
            reply(showReader(), nil)
        case "saveOfflineArticle":
            guard let id = OfflineArticle.postID(from: url) else {
                reply(nil, "UNAVAILABLE")
                return
            }
            reply(showSheet(OfflineSaveSheet(id: id, library: library)), nil)
        default:
            reply(nil, "UNAVAILABLE")
        }
    }

    private func applyPageTheme(_ color: UIColor, statusBarStyle: UIStatusBarStyle) {
        topTheme.backgroundColor = color
        pageStatusBarStyle = statusBarStyle
        updateTopChrome()
    }

    private func updateTopChrome() {
        let scrollView = webView.scrollView
        let isAtTop = scrollView.contentOffset.y + scrollView.adjustedContentInset.top <= 1
        let webVisible = !webView.isHidden
        topTheme.isHidden = !webVisible || !isAtTop
        let iconMidpoint = scrollView.contentOffset.y + view.safeAreaInsets.top / 2
        let headerStillBehindIcons = pageHeaderTop * scrollView.zoomScale <= iconMidpoint &&
            iconMidpoint < pageHeaderBottom * scrollView.zoomScale
        let style = webVisible && (isAtTop || headerStillBehindIcons) ? pageStatusBarStyle : .default
        guard themeStatusBarStyle != style else { return }
        themeStatusBarStyle = style
        setNeedsStatusBarAppearanceUpdate()
    }

    private func updatePageTheme(_ rgb: [Int]) {
        let components = rgb.map { Double($0) / 255 }
        let linear = components.map { value in
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        let luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        let color = UIColor(red: components[0], green: components[1], blue: components[2], alpha: 1)
        applyPageTheme(color, statusBarStyle: luminance > 0.179 ? .darkContent : .lightContent)
    }

    // Observe the live theme in an isolated world. The site swaps pages and post themes in place.
    private static let themeScript = #"""
        (() => {
          const body = document.body;
          const root = document.documentElement;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const pixel = canvas.getContext('2d', { willReadFrequently: true });
          if (!body || !pixel) return;

          const controlInsets = document.createElement('style');
          controlInsets.textContent = `
            .scroll-fab { margin-bottom: var(--mallinoi-bottom-safe-area, 0px); }
            @media (max-width: 700px) {
              .notification-menu, .bgm-menu, .pickle-menu {
                margin-bottom: var(--mallinoi-bottom-safe-area, 0px);
              }
            }
          `;
          document.head.append(controlInsets);

          function opaqueRGB(color) {
            if (!color) return null;
            pixel.clearRect(0, 0, 1, 1);
            pixel.fillStyle = 'transparent';
            pixel.fillStyle = color.trim();
            pixel.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = pixel.getImageData(0, 0, 1, 1).data;
            return alpha === 255 ? [red, green, blue] : null;
          }

          let lastTheme = '';
          let frame = 0;
          function publish() {
            frame = 0;
            const header = document.querySelector('.site-header');
            const style = getComputedStyle(body);
            const themed = [...body.classList].some(name => name.startsWith('theme-'));
            const rgb = (header && opaqueRGB(getComputedStyle(header).backgroundColor)) ||
              (themed && opaqueRGB(style.getPropertyValue('--color-primary'))) ||
              opaqueRGB(style.backgroundColor) || opaqueRGB(getComputedStyle(root).backgroundColor);
            if (!rgb) return;
            const path = location.pathname;
            const headerRect = header?.getBoundingClientRect();
            const headerTop = headerRect ? Math.max(0, Math.round(headerRect.top + scrollY)) : 0;
            const headerBottom = headerRect ? Math.max(headerTop, Math.round(headerRect.bottom + scrollY)) : 0;
            const theme = `${path}:${rgb.join(',')}:${headerTop}:${headerBottom}:${innerWidth}:${innerHeight}`;
            if (theme === lastTheme) return;
            lastTheme = theme;
            window.webkit.messageHandlers.mallinoiTheme.postMessage({ path, rgb, headerTop, headerBottom })
              .then(bottom => {
                if (lastTheme === theme) root.style.setProperty('--mallinoi-bottom-safe-area', `${bottom}px`);
              })
              .catch(() => {
                if (lastTheme === theme) lastTheme = '';
              });
          }

          function schedule() {
            if (!frame) frame = requestAnimationFrame(publish);
          }

          const observer = new MutationObserver(schedule);
          const attributes = { attributes: true, attributeFilter: ['class', 'style', 'data-calendar-appearance'] };
          observer.observe(root, attributes);
          observer.observe(body, attributes);
          const headerHost = document.querySelector('[data-include="header"]');
          if (headerHost) observer.observe(headerHost, { childList: true });
          document.addEventListener('load', event => {
            if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet') schedule();
          }, true);
          window.addEventListener('pageshow', schedule);
          window.addEventListener('popstate', schedule);
          window.addEventListener('resize', schedule);
          schedule();
        })();
        """#

    private func authenticate(at url: URL, request: String, reply: @escaping (Any?, String?) -> Void) {
        guard view.window != nil, presentedViewController == nil, authentication == nil else {
            reply(nil, "PROVIDER_FAILED")
            return
        }

        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: SiteURLs.authenticationCallbackScheme) {
            [weak self] callback, error in
            DispatchQueue.main.async {
                guard let self, self.authentication?.request == request else { return }
                self.authentication = nil
                guard error == nil, let callback, SiteURLs.completedRequest(from: callback) == request else {
                    reply(nil, "PROVIDER_FAILED")
                    return
                }
                reply(request, nil)
            }
        }
        session.presentationContextProvider = self
        authentication = (request, session)
        if !session.start() {
            authentication = nil
            reply(nil, "PROVIDER_FAILED")
        }
    }
}

@MainActor
private final class SiteMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    private weak var controller: SiteViewController?

    init(controller: SiteViewController) {
        self.controller = controller
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let controller else { replyHandler(nil, "UNAVAILABLE"); return }
        controller.handle(message, reply: replyHandler)
    }
}

extension SiteViewController: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }
}

extension SiteViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }

        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if SiteURLs.isSitePage(url) {
            // Retry never re-submits a form.
            retryRequest = URLRequest(url: url)
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        decisionHandler(.cancel)
        guard confirmTrustedOrigin(action.sourceFrame) else { return }
        if SiteURLs.provider(for: url) != nil {
            // Cached site code may still try to send the main web view to the provider.
            let alert = UIAlertController(
                title: "소셜 로그인",
                message: "화면을 새로고침한 뒤 다시 시도해 주세요.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "확인", style: .default))
            if presentedViewController == nil { present(alert, animated: true) }
            return
        }

        if action.navigationType == .linkActivated,
           let scheme = url.scheme, ["https", "http", "mailto", "tel", "sms", "itms-apps"].contains(scheme) {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        loading.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showConnectionError()
    }

    private func handleNavigationError(_ error: Error) {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        showConnectionError()
    }
}

extension SiteViewController: WKUIDelegate {
    private func siteDialog(message: String, frame: WKFrameInfo) -> UIAlertController? {
        guard confirmTrustedOrigin(frame), view.window != nil, presentedViewController == nil else { return nil }
        return UIAlertController(title: "말린오이닷컴", message: message, preferredStyle: .alert)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        guard let dialog = siteDialog(message: message, frame: frame) else { completionHandler(); return }
        dialog.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        present(dialog, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard let dialog = siteDialog(message: message, frame: frame) else { completionHandler(false); return }
        dialog.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        dialog.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        present(dialog, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        guard let dialog = siteDialog(message: prompt, frame: frame) else { completionHandler(nil); return }
        dialog.addTextField { $0.text = defaultText }
        dialog.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(nil) })
        dialog.addAction(UIAlertAction(title: "확인", style: .default) { [weak dialog] _ in
            completionHandler(dialog?.textFields?.first?.text)
        })
        present(dialog, animated: true)
    }
}
