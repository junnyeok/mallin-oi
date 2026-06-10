import SwiftUI
import WidgetKit

private let appGroupName = "group.com.mallinoi.calendar"

struct CalendarWidgetItem: Decodable, Identifiable {
    let calendarType: String
    let id: String
    let date: String
    let categoryName: String
    let categoryColor: String
    let title: String
    let memo: String
    let time: String?
    let sortOrder: Int
    let createdAt: String?
}

struct CalendarWidgetDay: Decodable, Identifiable {
    let date: String
    let isToday: Bool
    let isCurrentMonth: Bool
    let items: [CalendarWidgetItem]

    var id: String { date }
}

struct CalendarWidgetMonth: Decodable {
    let year: Int
    let month: Int
    let startDate: String
    let endDate: String
}

struct CalendarWidgetData: Decodable {
    let calendarType: String
    let calendarLabel: String
    let range: String
    let today: String
    let month: CalendarWidgetMonth
    let days: [CalendarWidgetDay]
}

struct CalendarWidgetEntry: TimelineEntry {
    let date: Date
    let isLoggedIn: Bool
    let widget: CalendarWidgetData?
    let calendarType: String
    let range: String
}

struct CalendarWidgetProvider: TimelineProvider {
    let calendarType: String
    let range: String

    func placeholder(in context: Context) -> CalendarWidgetEntry {
        CalendarWidgetEntry(
            date: Date(),
            isLoggedIn: true,
            widget: SampleData.widget(calendarType: calendarType, range: range),
            calendarType: calendarType,
            range: range
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (CalendarWidgetEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarWidgetEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadEntry() -> CalendarWidgetEntry {
        let defaults = UserDefaults(suiteName: appGroupName) ?? .standard
        let isLoggedIn = defaults.bool(forKey: "is_logged_in")
        let json = defaults.string(forKey: "payload_json") ?? ""
        let widget = decodeWidget(from: json)

        return CalendarWidgetEntry(
            date: Date(),
            isLoggedIn: isLoggedIn,
            widget: widget,
            calendarType: calendarType,
            range: range
        )
    }

    private func decodeWidget(from json: String) -> CalendarWidgetData? {
        guard let data = json.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let widgets = root["widgets"] as? [String: Any],
              let typeWidgets = widgets[calendarType] as? [String: Any],
              let widgetObject = typeWidgets[range],
              let widgetData = try? JSONSerialization.data(withJSONObject: widgetObject) else {
            return nil
        }

        return try? JSONDecoder().decode(CalendarWidgetData.self, from: widgetData)
    }
}

struct CalendarWidgetView: View {
    let entry: CalendarWidgetEntry

    var body: some View {
        ZStack {
            Color(red: 0.14, green: 0.14, blue: 0.16)

            if !entry.isLoggedIn {
                EmptyWidgetView(title: title, message: "로그인이 필요해요")
            } else if let widget = entry.widget {
                content(widget)
            } else {
                EmptyWidgetView(title: title, message: "앱을 열어 새로고침해줘요")
            }
        }
        .widgetURL(URL(string: "mallinoi://calendar?type=\(entry.calendarType)"))
    }

    private var title: String {
        label(for: entry.calendarType)
    }

    @ViewBuilder
    private func content(_ widget: CalendarWidgetData) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(widget.calendarLabel)
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .lineLimit(1)

                Spacer(minLength: 4)

                Text(subtitle(for: widget))
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1)
            }

            if entry.range == "month" {
                MonthGridView(widget: widget)
            } else {
                DayGridView(widget: widget, columns: entry.range == "fourDays" ? 2 : 7)
            }
        }
        .padding(12)
    }

    private func subtitle(for widget: CalendarWidgetData) -> String {
        if widget.range == "fourDays" { return "4일" }
        if widget.range == "twoWeeks" { return "2주" }
        return "\(widget.month.month)월"
    }

    private func label(for calendarType: String) -> String {
        if calendarType == "work" { return "업무" }
        if calendarType == "event" { return "이벤트" }
        return "자기개발"
    }
}

struct EmptyWidgetView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(.white)
                .lineLimit(1)

            Spacer()

            Text(message)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
                .frame(maxWidth: .infinity)

            Spacer()
        }
        .padding(12)
    }
}

struct DayGridView: View {
    let widget: CalendarWidgetData
    let columns: Int

    var body: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: columns),
            spacing: 5
        ) {
            ForEach(widget.days.prefix(widget.range == "fourDays" ? 4 : 14)) { day in
                DayCellView(day: day, compact: widget.range == "twoWeeks")
            }
        }
    }
}

struct MonthGridView: View {
    let widget: CalendarWidgetData

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                ForEach(["일", "월", "화", "수", "목", "금", "토"], id: \.self) { text in
                    Text(text)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(text == "일" ? .red.opacity(0.75) : text == "토" ? .blue.opacity(0.8) : .white.opacity(0.65))
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
                spacing: 4
            ) {
                ForEach(widget.days.prefix(42)) { day in
                    DayCellView(day: day, compact: true)
                }
            }
        }
    }
}

struct DayCellView: View {
    let day: CalendarWidgetDay
    let compact: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(dayNumber)
                .font(.system(size: compact ? 9 : 11, weight: day.isToday ? .bold : .semibold))
                .foregroundStyle(day.isCurrentMonth ? .white : .white.opacity(0.35))
                .lineLimit(1)

            if let item = day.items.first {
                Text(item.categoryName.isEmpty ? item.title : item.categoryName)
                    .font(.system(size: compact ? 8 : 10, weight: .bold))
                    .foregroundStyle(textColor(for: item.categoryColor))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                if !compact {
                    Text(item.title)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            } else {
                Text(" ")
                    .font(.system(size: compact ? 8 : 10))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 30 : 48)
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .background(day.isToday ? Color(red: 0.02, green: 0.22, blue: 0.42) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var dayNumber: String {
        String(Int(day.date.suffix(2)) ?? 0)
    }

    private func textColor(for hex: String) -> Color {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else {
            return .white
        }

        return Color(
            red: Double((value >> 16) & 0xff) / 255.0,
            green: Double((value >> 8) & 0xff) / 255.0,
            blue: Double(value & 0xff) / 255.0
        )
    }
}

struct SampleData {
    static func widget(calendarType: String, range: String) -> CalendarWidgetData {
        let calendar = Calendar.current
        let today = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let label = calendarType == "work" ? "업무" : calendarType == "event" ? "이벤트" : "자기개발"
        let days = (0..<42).map { index -> CalendarWidgetDay in
            let date = calendar.date(byAdding: .day, value: index, to: today) ?? today
            let dateKey = formatter.string(from: date)
            let item = index % 3 == 0 ? CalendarWidgetItem(
                calendarType: calendarType,
                id: "\(index)",
                date: dateKey,
                categoryName: label,
                categoryColor: calendarType == "work" ? "#fff6bf" : calendarType == "event" ? "#ffe0ef" : "#e7f6ff",
                title: "일정",
                memo: "",
                time: nil,
                sortOrder: 10,
                createdAt: nil
            ) : nil

            return CalendarWidgetDay(
                date: dateKey,
                isToday: index == 0,
                isCurrentMonth: true,
                items: item.map { [$0] } ?? []
            )
        }

        return CalendarWidgetData(
            calendarType: calendarType,
            calendarLabel: label,
            range: range,
            today: formatter.string(from: today),
            month: CalendarWidgetMonth(
                year: calendar.component(.year, from: today),
                month: calendar.component(.month, from: today),
                startDate: formatter.string(from: today),
                endDate: formatter.string(from: today)
            ),
            days: days
        )
    }
}

struct CalendarWidgetDefinition {
    let kind: String
    let name: String
    let description: String
    let calendarType: String
    let range: String
    let families: [WidgetFamily]
}

let definitions = [
    CalendarWidgetDefinition(kind: "mallinoi.study.fourDays", name: "말린오이 자기개발 4일", description: "내 자기개발 캘린더의 4일 일정을 볼 수 있어요.", calendarType: "study", range: "fourDays", families: [.systemSmall]),
    CalendarWidgetDefinition(kind: "mallinoi.study.twoWeeks", name: "말린오이 자기개발 2주", description: "내 자기개발 캘린더의 2주 일정을 볼 수 있어요.", calendarType: "study", range: "twoWeeks", families: [.systemMedium]),
    CalendarWidgetDefinition(kind: "mallinoi.study.month", name: "말린오이 자기개발 한 달", description: "내 자기개발 캘린더의 한 달 일정을 볼 수 있어요.", calendarType: "study", range: "month", families: [.systemLarge]),
    CalendarWidgetDefinition(kind: "mallinoi.work.fourDays", name: "말린오이 업무 4일", description: "내 업무 캘린더의 4일 일정을 볼 수 있어요.", calendarType: "work", range: "fourDays", families: [.systemSmall]),
    CalendarWidgetDefinition(kind: "mallinoi.work.twoWeeks", name: "말린오이 업무 2주", description: "내 업무 캘린더의 2주 일정을 볼 수 있어요.", calendarType: "work", range: "twoWeeks", families: [.systemMedium]),
    CalendarWidgetDefinition(kind: "mallinoi.work.month", name: "말린오이 업무 한 달", description: "내 업무 캘린더의 한 달 일정을 볼 수 있어요.", calendarType: "work", range: "month", families: [.systemLarge]),
    CalendarWidgetDefinition(kind: "mallinoi.event.fourDays", name: "말린오이 이벤트 4일", description: "내 이벤트 캘린더의 4일 일정을 볼 수 있어요.", calendarType: "event", range: "fourDays", families: [.systemSmall]),
    CalendarWidgetDefinition(kind: "mallinoi.event.twoWeeks", name: "말린오이 이벤트 2주", description: "내 이벤트 캘린더의 2주 일정을 볼 수 있어요.", calendarType: "event", range: "twoWeeks", families: [.systemMedium]),
    CalendarWidgetDefinition(kind: "mallinoi.event.month", name: "말린오이 이벤트 한 달", description: "내 이벤트 캘린더의 한 달 일정을 볼 수 있어요.", calendarType: "event", range: "month", families: [.systemLarge])
]

func makeWidgetConfiguration(_ definition: CalendarWidgetDefinition) -> some WidgetConfiguration {
    StaticConfiguration(
        kind: definition.kind,
        provider: CalendarWidgetProvider(calendarType: definition.calendarType, range: definition.range)
    ) { entry in
        CalendarWidgetView(entry: entry)
    }
    .configurationDisplayName(definition.name)
    .description(definition.description)
    .supportedFamilies(definition.families)
}

struct StudyFourDaysWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[0]) }
}

struct StudyTwoWeeksWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[1]) }
}

struct StudyMonthWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[2]) }
}

struct WorkFourDaysWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[3]) }
}

struct WorkTwoWeeksWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[4]) }
}

struct WorkMonthWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[5]) }
}

struct EventFourDaysWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[6]) }
}

struct EventTwoWeeksWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[7]) }
}

struct EventMonthWidget: Widget {
    var body: some WidgetConfiguration { makeWidgetConfiguration(definitions[8]) }
}

@main
struct MallinoiCalendarWidgetsBundle: WidgetBundle {
    var body: some Widget {
        StudyFourDaysWidget()
        StudyTwoWeeksWidget()
        StudyMonthWidget()
        WorkFourDaysWidget()
        WorkTwoWeeksWidget()
        WorkMonthWidget()
        EventFourDaysWidget()
        EventTwoWeeksWidget()
        EventMonthWidget()
    }
}
