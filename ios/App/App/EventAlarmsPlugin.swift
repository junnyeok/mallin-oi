import AlarmKit
import Capacitor
import CryptoKit
import SwiftUI
import UserNotifications

@available(iOS 26.0, *)
private struct EventAlarmMetadata: AlarmMetadata {}

@objc(EventAlarmsPlugin)
public class EventAlarmsPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "EventAlarmsPlugin"
    public let jsName = "EventAlarms"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replace", returnType: CAPPluginReturnPromise)
    ]
    private let prefix = "mallinoi.event-alarm."
    private let offsets: Set<Int> = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]
    private var pendingKeys = Set<String>()

    public override func load() { bridge?.notificationRouter.localNotificationHandler = self }
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        notification.request.identifier.hasPrefix(prefix) ? [.banner, .sound] : []
    }
    public func didReceive(response: UNNotificationResponse) {}

    private func storageKey(_ value: String?) -> String? {
        guard let value, value.hasPrefix("event:"), value.count <= 256 else { return nil }
        return prefix + SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    @MainActor private func permitted() async -> Bool {
        if #available(iOS 26.0, *) { return AlarmManager.shared.authorizationState == .authorized }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus == .authorized && settings.soundSetting == .enabled
    }

    @objc func getPermission(_ call: CAPPluginCall) {
        Task { @MainActor in call.resolve(["allowed": await permitted()]) }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                if #available(iOS 26.0, *) { _ = try await AlarmManager.shared.requestAuthorization() }
                else { _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) }
                // Even denial can be changed in the Settings page opened next.
                call.resolve(["allowed": await permitted()])
            } catch { call.reject("알람 권한 요청을 완료하지 못했어요. 다시 시도해 주세요.") }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        Task { @MainActor in
            let url = URL(string: UIApplication.openSettingsURLString)!
            let opened = await UIApplication.shared.open(url)
            if opened { call.resolve() }
            else { call.reject("휴대폰 설정에서 말린오이 캘린더의 알람을 허용해 주세요.") }
        }
    }

    @objc func getSettings(_ call: CAPPluginCall) {
        guard let key = storageKey(call.getString("key")) else { call.reject("일정 정보를 확인할 수 없어요."); return }
        Task { @MainActor in
            let record = UserDefaults.standard.dictionary(forKey: key)
            var result: [String: Any] = ["platform": "ios", "allowed": await permitted()]
            if let selection = record?["selection"] as? [Int] { result["selection"] = selection }
            else if let record { result["legacyAlarm"] = record }
            // Expose only OS-confirmed active alarms, while retaining elapsed choices for editing.
            let records = record?["alarms"] as? [[String: Any]] ?? []
            if #available(iOS 26.0, *) {
                let ids = (try? AlarmManager.shared.alarms) ?? []
                result["activeCount"] = records.filter { item in
                    guard let id = item["id"] as? String else { return false }
                    return ids.contains { $0.id.uuidString == id }
                }.count
            } else {
                let ids = Set(await UNUserNotificationCenter.current().pendingNotificationRequests().map(\.identifier))
                result["activeCount"] = records.filter { ids.contains($0["id"] as? String ?? "") }.count
            }
            call.resolve(result)
        }
    }

    @MainActor private func remove(_ record: [String: Any], legacyKey: String? = nil) throws {
        if #available(iOS 26.0, *), record["mode"] as? String == "system-alarm",
           let raw = record["id"] as? String, let id = UUID(uuidString: raw),
           try AlarmManager.shared.alarms.contains(where: { $0.id == id }) {
            try AlarmManager.shared.cancel(id: id)
        }
        if let id = record["notificationID"] as? String ?? (record["mode"] as? String == "notification" ? (record["id"] as? String ?? legacyKey) : nil) {
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [id])
            center.removeDeliveredNotifications(withIdentifiers: [id])
        }
    }

    @MainActor private func schedule(_ alarm: [String: Any], key: String) async throws -> [String: Any] {
        let title = alarm["title"] as! String, message = alarm["message"] as! String
        let fireAt = (alarm["fireAt"] as! NSNumber).doubleValue
        let date = Date(timeIntervalSince1970: fireAt / 1000)
        guard date > Date() else { throw NSError(domain: "EventAlarms", code: 1) }
        var record = alarm
        if #available(iOS 26.0, *) {
            let id = UUID()
            let alert: AlarmPresentation.Alert
            if #available(iOS 26.1, *) { alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: message)) }
            else { alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: message),
                stopButton: AlarmButton(text: "끄기", textColor: .white, systemImageName: "stop.circle")) }
            let attributes = AlarmAttributes<EventAlarmMetadata>(presentation: AlarmPresentation(alert: alert),
                metadata: EventAlarmMetadata(), tintColor: Color(red: 250 / 255, green: 133 / 255, blue: 154 / 255))
            _ = try await AlarmManager.shared.schedule(id: id, configuration: .alarm(schedule: .fixed(date), attributes: attributes))
            record["id"] = id.uuidString; record["mode"] = "system-alarm"
        } else {
            let id = key + "." + UUID().uuidString
            let content = UNMutableNotificationContent()
            content.title = "말린오이 캘린더"; content.body = message; content.sound = .default
            var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
            var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
            components.timeZone = calendar.timeZone
            try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
            record["id"] = id; record["notificationID"] = id; record["mode"] = "notification"
        }
        record["title"] = title
        return record
    }

    @objc func replace(_ call: CAPPluginCall) {
        guard let key = storageKey(call.getString("key")),
              let previousKey = storageKey(call.getString("previousKey") ?? call.getString("key")),
              let selection = call.getArray("selection", Int.self), selection.count <= 2,
              Set(selection).count == selection.count, selection.allSatisfy({ offsets.contains($0) }),
              let alarms = call.getArray("alarms", JSObject.self), alarms.count <= 2, alarms.count <= selection.count else {
            call.reject("알람은 최대 두 개까지 지정할 수 있어요."); return
        }
        var scheduledOffsets = Set<Int>()
        for alarm in alarms {
            guard let title = alarm["title"] as? String, !title.isEmpty, title.count <= 200,
                  let message = alarm["message"] as? String, !message.isEmpty, message.count <= 300,
                  let fireAt = alarm["fireAt"] as? NSNumber, fireAt.doubleValue.isFinite,
                  fireAt.doubleValue > Date().timeIntervalSince1970 * 1000, fireAt.doubleValue < 253402300800000,
                  let minutes = alarm["minutes"] as? Int, selection.contains(minutes), scheduledOffsets.insert(minutes).inserted else {
                call.reject("알람 시각이 지났거나 일정 정보가 올바르지 않아요. 다시 저장해 주세요."); return
            }
        }
        Task { @MainActor in
            let keys: Set<String> = [key, previousKey]
            guard pendingKeys.isDisjoint(with: keys) else { call.reject("알람을 저장하고 있어요."); return }
            pendingKeys.formUnion(keys)
            defer { pendingKeys.subtract(keys) }
            let permissionAllowed = await permitted()
            if !alarms.isEmpty && !permissionAllowed { call.reject("휴대폰 설정에서 말린오이 캘린더의 알람을 허용해 주세요."); return }
            var staged = [[String: Any]]()
            do {
                // Stage both first: a failed second registration preserves the previous pair.
                for alarm in alarms { staged.append(try await schedule(alarm, key: key)) }
                for oldKey in keys {
                    guard let old = UserDefaults.standard.dictionary(forKey: oldKey) else { continue }
                    if let records = old["alarms"] as? [[String: Any]] {
                        for record in records { try remove(record) }
                    } else { try remove(old, legacyKey: oldKey) }
                }
                UserDefaults.standard.set(["selection": selection, "alarms": staged], forKey: key)
                if key != previousKey { UserDefaults.standard.removeObject(forKey: previousKey) }
                call.resolve(["scheduled": true, "count": staged.count])
            } catch {
                for record in staged { try? remove(record) }
                call.reject("알람을 반영하지 못했어요. 권한을 확인하고 저장을 다시 눌러 주세요.")
            }
        }
    }
}
