import Capacitor
import Foundation
import WidgetKit

@objc(CalendarWidgetsPlugin)
public class CalendarWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarWidgetsPlugin"
    public let jsName = "CalendarWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingRoute", returnType: CAPPluginReturnPromise)
    ]

    private let suiteName = "group.com.mallinoi.calendar"

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
