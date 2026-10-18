import Capacitor
import Foundation
import UIKit
import WidgetKit

@objc(CalendarWidgetsPlugin)
public class CalendarWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarWidgetsPlugin"
    public let jsName = "CalendarWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingRoute", returnType: CAPPluginReturnPromise)
    ]

    private let suiteName = "group.com.mallinoi.calendar"

    public override func load() {
        applyAppearance(savedAppearance())
    }

    private func savedAppearance() -> String {
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        return defaults.string(forKey: "appearance") == "dark" ? "dark" : "light"
    }

    private func applyAppearance(_ appearance: String) {
        DispatchQueue.main.async { [weak self] in
            let dark = appearance == "dark"
            let background = dark ? UIColor(red: 23 / 255, green: 25 / 255, blue: 30 / 255, alpha: 1) : .white
            self?.bridge?.viewController?.overrideUserInterfaceStyle = dark ? .dark : .light
            self?.bridge?.webView?.backgroundColor = background
            self?.bridge?.webView?.scrollView.backgroundColor = background
        }
    }

    @objc func getAppearance(_ call: CAPPluginCall) {
        call.resolve(["appearance": savedAppearance()])
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        guard let appearance = call.getString("appearance"), ["light", "dark"].contains(appearance) else {
            call.reject("Invalid calendar appearance")
            return
        }
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        // Separate from the schedule payload so refresh and logout preserve the preference.
        defaults.set(appearance, forKey: "appearance")
        defaults.synchronize()
        applyAppearance(appearance)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func saveWidgetData(_ call: CAPPluginCall) {
        let isLoggedIn = call.getBool("isLoggedIn") ?? false
        let payload = call.getObject("payload") ?? [:]
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard

        if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: "payload_json")
        }

        defaults.set(isLoggedIn, forKey: "is_logged_in")
        defaults.synchronize()

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }

    @objc func consumePendingRoute(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        let calendarType = defaults.string(forKey: "pending_calendar_type") ?? ""
        defaults.removeObject(forKey: "pending_calendar_type")
        defaults.synchronize()

        call.resolve([
            "calendarType": calendarType
        ])
    }
}
