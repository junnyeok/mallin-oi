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
    }

    let id: String
    let name: String
    let weeks: [String: [Row]]
}

struct GroupSnapshot: Decodable {
    let groupBoards: [String: [GroupWeekBoard]]

    static func read() -> [String: [GroupWeekBoard]] {
        let defaults = UserDefaults(suiteName: appGroupName)
        guard defaults?.bool(forKey: "is_logged_in") == true,
              let json = defaults?.string(forKey: "payload_json"),
              let snapshot = try? JSONDecoder().decode(Self.self, from: Data(json.utf8)) else { return [:] }
        return snapshot.groupBoards
    }
}

@available(iOS 17.0, *)
struct WidgetGroupOptions: DynamicOptionsProvider {
    let type: String
    func results() async throws -> IntentItemCollection<String> {
        let items = (GroupSnapshot.read()[type] ?? []).map { IntentItem($0.id, title: "\($0.name)") }
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
