import SafariServices
import SwiftUI
import UIKit

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
        let window = UIWindow(windowScene: scene)
        window.rootViewController = SiteLauncher()
        self.window = window
        window.makeKeyAndVisible()
    }
}

final class SiteLauncher: UIViewController, SFSafariViewControllerDelegate {
    private static let home = URL(string: "https://mallin-oi.com/")!
    private let green = UIColor(red: 0.71, green: 0.84, blue: 0.42, alpha: 1)
    private let ink = UIColor(red: 0.14, green: 0.21, blue: 0.06, alpha: 1)
    private let library = OfflineLibrary()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.98, blue: 0.87, alpha: 1)

        let mark = UIImageView(image: UIImage(named: "SiteMark"))
        mark.contentMode = .scaleAspectFit
        mark.isAccessibilityElement = false

        var style = UIButton.Configuration.filled()
        style.title = "말린오이닷컴 열기"
        style.baseForegroundColor = ink
        style.baseBackgroundColor = green
        style.cornerStyle = .capsule
        style.buttonSize = .large
        let open = UIButton(configuration: style, primaryAction: UIAction { [weak self] _ in
            self?.openSite()
        })

        var savedStyle = UIButton.Configuration.bordered()
        savedStyle.title = "저장된 글"
        savedStyle.image = UIImage(systemName: "bookmark")
        savedStyle.imagePadding = 8
        savedStyle.baseForegroundColor = ink
        savedStyle.cornerStyle = .capsule
        savedStyle.buttonSize = .large
        let saved = UIButton(configuration: savedStyle, primaryAction: UIAction { [weak self] _ in
            guard let self else { return }
            let reader = UIHostingController(rootView: OfflineReader(library: self.library))
            self.present(reader, animated: true)
        })

        let stack = UIStackView(arrangedSubviews: [mark, open, saved])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            mark.widthAnchor.constraint(equalToConstant: 128),
            mark.heightAnchor.constraint(equalTo: mark.widthAnchor),
        ])
    }

    private func openSite() {
        guard presentedViewController == nil else { return }
        let browser = SFSafariViewController(url: Self.home)
        browser.delegate = self
        browser.preferredBarTintColor = green
        browser.preferredControlTintColor = ink
        browser.dismissButtonStyle = .close
        present(browser, animated: true)
    }

    func safariViewController(
        _ controller: SFSafariViewController,
        activityItemsFor url: URL,
        title: String?
    ) -> [UIActivity] {
        guard let id = OfflineArticle.postID(from: url) else { return [] }
        return [SaveOfflineActivity(id: id, library: library)]
    }
}
