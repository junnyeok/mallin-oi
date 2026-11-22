import AppIntents
import SwiftUI
import WidgetKit

private struct GroupWeekEntry: TimelineEntry {
    let date: Date
    let type: String
    let label: String
    let groupID: String?
    let groupName: String?
    let rows: [GroupWeekBoard.Row]?
    let message: String
    let isDark: Bool
    let dates: [String]
    let today: String

    init(date: Date, type: String, label: String, selected: String?, preview: Bool = false) {
        self.date = date
        self.type = type
        self.label = label
        let calendar = Calendar(identifier: .gregorian)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let start = calendar.date(byAdding: .day, value: 1 - calendar.component(.weekday, from: date), to: date)!
        let keys = (0..<7).map { formatter.string(from: calendar.date(byAdding: .day, value: $0, to: start)!) }
        dates = keys
        today = formatter.string(from: date)
        let defaults = UserDefaults(suiteName: appGroupName)
        isDark = defaults?.string(forKey: "appearance") == "dark"
        if preview {
            groupID = nil
            groupName = "우리 그룹"
            let titles = type == "work" ? ["주간", "야간"] : type == "event" ? ["약속", "모임"] : ["운동", "공부"]
            rows = (0..<2).map { i in
                .init(name: ["오", "친"][i], days: [keys[i]: [.init(title: titles[i], color: ["#e3f4c8", "#ffe3ee"][i], done: false)]])
            }
            message = ""
            return
        }
        let options = GroupSnapshot.read()[type] ?? []
        let board = selected.flatMap { id in options.first { $0.id == id } } ?? (selected == nil && options.count == 1 ? options.first : nil)
        groupID = board?.id
        groupName = board?.name
        rows = board?.weeks[keys[0]]
        if defaults?.bool(forKey: "is_logged_in") != true {
            message = "앱에서 로그인해 주세요"
        } else if board != nil {
            message = "앱을 열어 이번 주 일정을 갱신해 주세요"
        } else if options.isEmpty {
            message = "앱에서 연결할 그룹을 확인해 주세요"
        } else {
            message = "위젯 편집에서 그룹을 선택해 주세요"
        }
    }
}

@available(iOS 17.0, *)
private struct GroupWeekProvider<Intent: GroupSelectionIntent>: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> GroupWeekEntry {
        GroupWeekEntry(date: .now, type: Intent.calendarType, label: Intent.calendarLabel, selected: nil, preview: true)
    }
    func snapshot(for configuration: Intent, in context: Context) async -> GroupWeekEntry {
        GroupWeekEntry(date: .now, type: Intent.calendarType, label: Intent.calendarLabel, selected: configuration.groupID, preview: context.isPreview)
    }
    func timeline(for configuration: Intent, in context: Context) async -> Timeline<GroupWeekEntry> {
        let now = Date()
        let midnight = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: now)!)
        let entries = [now, midnight].map {
            GroupWeekEntry(date: $0, type: Intent.calendarType, label: Intent.calendarLabel, selected: configuration.groupID)
        }
        return Timeline(entries: entries, policy: .after(midnight.addingTimeInterval(60)))
    }
}

private struct GroupWeekView: View {
    let entry: GroupWeekEntry
    @Environment(\.widgetFamily) var family
    private var palette: CalendarWidgetTheme { theme(for: entry.type, isDark: entry.isDark) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            CalendarWidgetHeader(title: entry.groupName ?? "\(entry.label) 그룹", subtitle: "\(entry.label) · 1주", theme: palette)
            if let rows = entry.rows, !rows.isEmpty {
                HStack(spacing: 2) {
                    Color.clear.frame(width: 25, height: 1)
                    ForEach(entry.dates.indices, id: \.self) { day in
                        let key = entry.dates[day]
                        Text("\(koreanWeekdays[day]) \(Int(key.suffix(2)) ?? 0)")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 2)
                            .background(key == entry.today ? palette.soft : .clear, in: Capsule())
                            .overlay(Capsule().stroke(key == entry.today ? palette.primary : .clear))
                    }
                }
                let limit = family == .systemLarge ? 6 : 2
                ForEach(0..<min(limit, rows.count), id: \.self) { index in
                    memberRow(rows[index])
                    if index + 1 < min(limit, rows.count) { Divider() }
                }
                if rows.count > limit {
                    Text("나머지 \(rows.count - limit)줄 · 그룹 열기 ›")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(palette.mutedText)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            } else {
                Text(entry.message).font(.caption).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .foregroundStyle(palette.text)
        .padding(9)
        .modifier(CalendarWidgetBackground(theme: palette))
        .environment(\.colorScheme, entry.isDark ? .dark : .light)
        .widgetURL(link)
    }

    private var link: URL? {
        var url = URLComponents(string: "mallinoi://calendar")
        url?.queryItems = [URLQueryItem(name: "type", value: entry.type)]
        if let id = entry.groupID { url?.queryItems?.append(URLQueryItem(name: "group", value: id)) }
        return url?.url
    }

    private func memberRow(_ row: GroupWeekBoard.Row) -> some View {
        HStack(alignment: .top, spacing: 2) {
            Text(row.name).font(.system(size: 10, weight: .bold))
                .lineLimit(2).frame(width: 25, alignment: .leading)
            ForEach(entry.dates, id: \.self) { key in
                let items = row.days[key] ?? []
                VStack(spacing: 1) {
                    ForEach(0..<min(items.count, 2), id: \.self) { i in
                        let item = items[i]
                        Text(item.title).strikethrough(item.done)
                            .font(.system(size: 9, weight: .semibold)).lineLimit(1)
                            .foregroundStyle(palette.badgeTextColor(for: item.color))
                            .frame(maxWidth: .infinity)
                            .background(palette.textColor(for: item.color), in: RoundedRectangle(cornerRadius: 3))
                    }
                    if items.count > 2 { Text("+\(items.count - 2)").font(.system(size: 8)) }
                }
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

@available(iOS 17.0, *)
struct GroupWeekWidget<Intent: GroupSelectionIntent>: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "mallinoi.\(Intent.calendarType).groupWeek", intent: Intent.self,
                               provider: GroupWeekProvider<Intent>()) { entry in
            GroupWeekView(entry: entry)
        }
        .configurationDisplayName(Text(verbatim: Intent.calendarLabel + " 그룹 1주"))
        .description("그룹원별로 이번 주 일정을 확인해요.")
        .supportedFamilies([.systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

@available(iOS 18.0, *)
private struct PromptedGroupWidget<Intent: GroupSelectionIntent>: Widget {
    var body: some WidgetConfiguration { GroupWeekWidget<Intent>().body.promptsForUserConfiguration() }
}

@available(iOS 18.0, *)
struct PromptedGroupBundle: WidgetBundle {
    var body: some Widget {
        PersonalCalendarWidgets().body
        PromptedGroupWidget<StudyGroupIntent>()
        PromptedGroupWidget<WorkGroupIntent>()
        PromptedGroupWidget<EventGroupIntent>()
    }
}
