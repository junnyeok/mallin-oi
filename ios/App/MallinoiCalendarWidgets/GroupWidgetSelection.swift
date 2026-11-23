import AppIntents
import Foundation

let appGroupName = "group.com.mallinoi.calendar"

struct GroupWeekBoard: Decodable {
    struct Item: Decodable {
        let title: String
        let color: String
        let done: Bool
    }

    struct Row: Decodable {
        let name: String
        let days: [String: [Item]]
        let shared: Bool?
    }

    let id: String
    let name: String
    let weeks: [String: [Row]]
}

struct WidgetGroupChoice: Decodable {
    let id: String
    let name: String
}

enum GroupSnapshot {
    static let choicesKey = "widget_group_choices"

    private struct SavedChoices: Decodable {
        let accountID: String
        let groups: [String: [WidgetGroupChoice]]
    }

    private struct LegacyChoices: Decodable {
        let groupBoards: [String: [WidgetGroupChoice]]
    }

    static func choices(for type: String, in defaults: UserDefaults?) -> [WidgetGroupChoice] {
        if let json = defaults?.string(forKey: choicesKey),
           let snapshot = try? JSONDecoder().decode(SavedChoices.self, from: Data(json.utf8)) {
            guard !snapshot.accountID.isEmpty, snapshot.accountID == defaults?.string(forKey: "widget_account") else { return [] }
            return snapshot.groups[type] ?? []
        }

        // Upgraded widgets can still select groups before the app's first refresh.
        guard let data = scheduleData(in: defaults),
              let snapshot = try? JSONDecoder().decode(LegacyChoices.self, from: data) else { return [] }
        return snapshot.groupBoards[type] ?? []
    }

    static func board(for type: String, id: String, in defaults: UserDefaults?) -> GroupWeekBoard? {
        guard let data = scheduleData(in: defaults),
              let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let groups = payload["groupBoards"] as? [String: [[String: Any]]],
              let board = groups[type]?.first(where: { $0["id"] as? String == id }),
              let boardData = try? JSONSerialization.data(withJSONObject: board) else { return nil }
        return try? JSONDecoder().decode(GroupWeekBoard.self, from: boardData)
    }

    private static func scheduleData(in defaults: UserDefaults?) -> Data? {
        guard defaults?.bool(forKey: "is_logged_in") == true,
              let json = defaults?.string(forKey: "payload_json") else { return nil }
        return Data(json.utf8)
    }
}

@available(iOS 17.0, *)
struct WidgetGroupOptions: DynamicOptionsProvider {
    let type: String
    func results() async throws -> IntentItemCollection<String> {
        let choices = GroupSnapshot.choices(for: type, in: UserDefaults(suiteName: appGroupName))
        guard !choices.isEmpty else { return .empty }
        let items = choices.map { IntentItem($0.id, title: "\($0.name)") }
        return IntentItemCollection(sections: [IntentItemSection(items: items)])
    }
}

@available(iOS 17.0, *)
protocol GroupSelectionIntent: WidgetConfigurationIntent {
    static var calendarType: String { get }
    static var calendarLabel: String { get }
    var groupID: String? { get }
}

@available(iOS 17.0, *)
struct StudyGroupIntent: GroupSelectionIntent {
    static let title: LocalizedStringResource = "자기개발 그룹 선택"
    static let calendarType = "study"
    static let calendarLabel = "자기개발"
    @Parameter(title: "표시할 그룹", optionsProvider: WidgetGroupOptions(type: "study"))
    var groupID: String?
}

@available(iOS 17.0, *)
struct WorkGroupIntent: GroupSelectionIntent {
    static let title: LocalizedStringResource = "업무 그룹 선택"
    static let calendarType = "work"
    static let calendarLabel = "업무"
    @Parameter(title: "표시할 그룹", optionsProvider: WidgetGroupOptions(type: "work"))
    var groupID: String?
}

@available(iOS 17.0, *)
struct EventGroupIntent: GroupSelectionIntent {
    static let title: LocalizedStringResource = "이벤트 그룹 선택"
    static let calendarType = "event"
    static let calendarLabel = "이벤트"
    @Parameter(title: "표시할 그룹", optionsProvider: WidgetGroupOptions(type: "event"))
    var groupID: String?
}
