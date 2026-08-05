import SwiftUI
import WidgetKit

private let appGroupName = "group.com.mallinoi.calendar"
private let koreanWeekdays = ["일", "월", "화", "수", "목", "금", "토"]

struct CalendarWidgetItem: Decodable, Identifiable {
    let calendarType: String
    let id: String
    let date: String
    let categoryName: String
    let categoryColor: String
    let displayTitle: String?
    let displayColor: String?
    let title: String
    let memo: String
    let time: String?
    let sortOrder: Int
    let createdAt: String?
}

struct CalendarWidgetTheme {
    let primary: Color
    let secondary: Color
    let background: Color
    let text: Color
    let mutedText: Color
    let border: Color
}

func theme(for calendarType: String) -> CalendarWidgetTheme {
    if calendarType == "work" {
        return CalendarWidgetTheme(
            primary: Color(red: 52 / 255, green: 52 / 255, blue: 206 / 255),
            secondary: Color(red: 245 / 255, green: 245 / 255, blue: 70 / 255),
            background: .white,
            text: Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255),
            mutedText: Color(red: 102 / 255, green: 102 / 255, blue: 102 / 255),
            border: Color(red: 217 / 255, green: 217 / 255, blue: 217 / 255)
        )
    }

    if calendarType == "event" {
        return CalendarWidgetTheme(
            primary: Color(red: 250 / 255, green: 133 / 255, blue: 154 / 255),
            secondary: Color(red: 1, green: 192 / 255, blue: 203 / 255),
            background: .white,
            text: Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255),
            mutedText: Color(red: 102 / 255, green: 102 / 255, blue: 102 / 255),
            border: Color(red: 217 / 255, green: 217 / 255, blue: 217 / 255)
        )
    }

    return CalendarWidgetTheme(
        primary: Color(red: 60 / 255, green: 60 / 255, blue: 60 / 255),
        secondary: Color(red: 187 / 255, green: 187 / 255, blue: 187 / 255),
        background: .white,
        text: Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255),
        mutedText: Color(red: 102 / 255, green: 102 / 255, blue: 102 / 255),
        border: Color(red: 217 / 255, green: 217 / 255, blue: 217 / 255)
    )
}

struct CalendarWidgetDay: Decodable, Identifiable {
    let date: String
    let weekday: String?
    let isToday: Bool
    let isCurrentMonth: Bool
    let items: [CalendarWidgetItem]

    var id: String { date }

    func isToday(at referenceDate: Date, calendar: Calendar = .current) -> Bool {
        let components = date.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return false }

        var dayComponents = DateComponents()
        dayComponents.calendar = calendar
        dayComponents.timeZone = calendar.timeZone
        dayComponents.year = components[0]
        dayComponents.month = components[1]
        dayComponents.day = components[2]

        guard let dayDate = calendar.date(from: dayComponents) else { return false }
        return calendar.isDate(dayDate, inSameDayAs: referenceDate)
    }
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
        let calendar = Calendar.current
        let now = Date()
        let nextMidnight = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? calendar.date(byAdding: .day, value: 1, to: now) ?? now
        let refreshAfterMidnight = calendar.date(byAdding: .minute, value: 1, to: nextMidnight) ?? nextMidnight
        let entries = [loadEntry(at: now), loadEntry(at: nextMidnight)]

        completion(Timeline(entries: entries, policy: .after(refreshAfterMidnight)))
    }

    private func loadEntry(at date: Date = Date()) -> CalendarWidgetEntry {
        let defaults = UserDefaults(suiteName: appGroupName) ?? .standard
        let isLoggedIn = defaults.bool(forKey: "is_logged_in")
        let json = defaults.string(forKey: "payload_json") ?? ""
        let widget = decodeWidget(from: json)

        return CalendarWidgetEntry(
            date: date,
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
        let activeTheme = theme(for: entry.calendarType)

        ZStack {
            activeTheme.background

            if !entry.isLoggedIn {
                EmptyWidgetView(title: title, message: "로그인이 필요해요", theme: activeTheme)
            } else if let widget = entry.widget {
                content(widget, theme: activeTheme)
            } else {
                EmptyWidgetView(title: title, message: "앱을 열어 새로고침해줘요", theme: activeTheme)
            }
        }
        .background(activeTheme.background)
        .widgetURL(URL(string: "mallinoi://calendar?type=\(entry.calendarType)"))
    }

    private var title: String {
        label(for: entry.calendarType)
    }

    @ViewBuilder
    private func content(_ widget: CalendarWidgetData, theme: CalendarWidgetTheme) -> some View {
        if entry.range == "month" {
            GeometryReader { proxy in
                let layout = MonthWidgetLayout(
                    availableHeight: proxy.size.height,
                    rowCount: max(1, Int(ceil(Double(widget.days.count) / 7.0)))
                )

                VStack(alignment: .leading, spacing: layout.headerSpacing) {
                    CalendarWidgetHeader(
                        title: widget.calendarLabel,
                        subtitle: subtitle(for: widget),
                        scale: layout.scale,
                        height: layout.headerHeight,
                        theme: theme
                    )

                    MonthGridView(widget: widget, layout: layout, referenceDate: entry.date, theme: theme)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .padding(.horizontal, 8 * layout.scale)
                .padding(.vertical, layout.verticalPadding)
            }
        } else {
            VStack(alignment: .leading, spacing: 5) {
                CalendarWidgetHeader(
                    title: widget.calendarLabel,
                    subtitle: subtitle(for: widget),
                    theme: theme
                )

                DayGridView(widget: widget, columns: entry.range == "fourDays" ? 2 : 7, referenceDate: entry.date, theme: theme)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
        }
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

struct CalendarWidgetHeader: View {
    let title: String
    let subtitle: String
    var scale: CGFloat = 1
    var height: CGFloat? = nil
    let theme: CalendarWidgetTheme

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(scale == 1 ? .caption.bold() : .system(size: 12 * scale, weight: .bold))
                .foregroundStyle(theme.text)
                .lineLimit(1)

            Spacer(minLength: 4 * scale)

            Text(subtitle)
                .font(scale == 1 ? .caption2 : .system(size: 11 * scale))
                .foregroundStyle(theme.mutedText)
                .lineLimit(1)
        }
        .frame(height: height)
        .padding(.horizontal, 6 * scale)
    }
}

struct EmptyWidgetView: View {
    let title: String
    let message: String
    let theme: CalendarWidgetTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(theme.text)
                .lineLimit(1)

            Spacer()

            Text(message)
                .font(.caption)
                .foregroundStyle(theme.mutedText)
                .frame(maxWidth: .infinity)

            Spacer()
        }
        .padding(10)
    }
}

struct DayGridView: View {
    let widget: CalendarWidgetData
    let columns: Int
    let referenceDate: Date
    let theme: CalendarWidgetTheme

    var body: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: widget.range == "fourDays" ? 4 : 2), count: columns),
            spacing: widget.range == "fourDays" ? 3 : 4
        ) {
            ForEach(widget.days.prefix(widget.range == "fourDays" ? 4 : 14)) { day in
                DayCellView(day: day, calendarType: widget.calendarType, range: widget.range, compact: widget.range == "twoWeeks", monthRows: 0, referenceDate: referenceDate, theme: theme)
            }
        }
        .padding(.top, widget.range == "fourDays" ? 7 : 8)
    }
}

struct MonthGridView: View {
    let widget: CalendarWidgetData
    let layout: MonthWidgetLayout
    let referenceDate: Date
    let theme: CalendarWidgetTheme

    var body: some View {
        VStack(spacing: layout.weekdaySpacing) {
            HStack {
                ForEach(["일", "월", "화", "수", "목", "금", "토"], id: \.self) { text in
                    Text(text)
                        .font(.system(size: 9 * layout.scale, weight: .semibold))
                        .foregroundStyle(text == "일" ? .red.opacity(0.8) : text == "토" ? .blue.opacity(0.8) : theme.mutedText)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: layout.weekdayHeight)

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 2 * layout.scale), count: 7),
                spacing: layout.rowSpacing
            ) {
                ForEach(widget.days) { day in
                    DayCellView(day: day, calendarType: widget.calendarType, range: widget.range, compact: true, monthRows: layout.rowCount, availableCellHeight: layout.cellHeight, referenceDate: referenceDate, theme: theme)
                }
            }
        }
        .padding(.top, layout.gridTopPadding)
    }
}

struct MonthWidgetLayout {
    let rowCount: Int
    let scale: CGFloat
    let verticalPadding: CGFloat
    let headerHeight: CGFloat
    let headerSpacing: CGFloat
    let gridTopPadding: CGFloat
    let weekdayHeight: CGFloat
    let weekdaySpacing: CGFloat
    let rowSpacing: CGFloat
    let cellHeight: CGFloat

    init(availableHeight: CGFloat, rowCount: Int) {
        self.rowCount = max(1, rowCount)

        let baseVerticalPadding: CGFloat = 11
        let baseHeaderHeight: CGFloat = 15
        let baseHeaderSpacing: CGFloat = 10
        let baseGridTopPadding: CGFloat = 6
        let baseWeekdayHeight: CGFloat = 12
        let baseWeekdaySpacing: CGFloat = 2
        let baseCellHeight: CGFloat = 45
        let baseMinimumRowSpacing: CGFloat = 3
        let baseMaximumRowSpacing: CGFloat = 10
        let spacingCount = CGFloat(max(self.rowCount - 1, 0))
        let fixedHeight = baseVerticalPadding * 2
            + baseHeaderHeight
            + baseHeaderSpacing
            + baseGridTopPadding
            + baseWeekdayHeight
            + baseWeekdaySpacing
        let preferredMinimumHeight = fixedHeight
            + baseCellHeight * CGFloat(self.rowCount)
            + baseMinimumRowSpacing * spacingCount
        let resolvedScale = min(1, max(0, availableHeight) / preferredMinimumHeight)

        scale = resolvedScale
        verticalPadding = baseVerticalPadding * resolvedScale
        headerHeight = baseHeaderHeight * resolvedScale
        headerSpacing = baseHeaderSpacing * resolvedScale
        gridTopPadding = baseGridTopPadding * resolvedScale
        weekdayHeight = baseWeekdayHeight * resolvedScale
        weekdaySpacing = baseWeekdaySpacing * resolvedScale

        let scaledFixedHeight = fixedHeight * resolvedScale
        let rowsHeight = max(0, availableHeight - scaledFixedHeight)
        let targetCellHeight = baseCellHeight * resolvedScale
        let minimumRowSpacing = baseMinimumRowSpacing * resolvedScale
        let maximumRowSpacing = baseMaximumRowSpacing * resolvedScale
        let distributableSpacing = spacingCount > 0
            ? (rowsHeight - targetCellHeight * CGFloat(self.rowCount)) / spacingCount
            : 0
        let resolvedRowSpacing = spacingCount > 0
            ? min(maximumRowSpacing, max(minimumRowSpacing, distributableSpacing))
            : 0

        rowSpacing = resolvedRowSpacing
        cellHeight = max(
            0,
            (rowsHeight - resolvedRowSpacing * spacingCount) / CGFloat(self.rowCount)
        )
    }
}

struct DayCellView: View {
    let day: CalendarWidgetDay
    let calendarType: String
    let range: String
    let compact: Bool
    let monthRows: Int
    var availableCellHeight: CGFloat? = nil
    let referenceDate: Date
    let theme: CalendarWidgetTheme

    private var isToday: Bool {
        day.isToday(at: referenceDate)
    }

    var body: some View {
        VStack(spacing: itemSpacing) {
            Text(dayNumber)
                .font(.system(size: dateFontSize, weight: isToday ? .bold : .semibold))
                .foregroundStyle(dayNumberColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            ForEach(Array(visibleItems.prefix(maxVisibleItems))) { item in
                Text(displayTitle(for: item))
                    .font(.system(size: badgeFontSize, weight: .bold))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .truncationMode(.tail)
                    .padding(.horizontal, 4 * monthContentScale)
                    .padding(.vertical, badgeVerticalPadding)
                    .frame(maxWidth: .infinity, minHeight: badgeHeight, maxHeight: badgeHeight)
                    .background(textColor(for: item.displayColor ?? item.categoryColor))
                    .clipShape(RoundedRectangle(cornerRadius: 5 * monthContentScale, style: .continuous))
            }

            if hasWorkMemo, let item = visibleItems.first {
                Text(workMemo(for: item))
                    .font(.system(size: memoFontSize, weight: .medium))
                    .foregroundStyle(isToday ? .white : theme.mutedText)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity)
            }

            if overflowCount > 0 {
                Text("+\(overflowCount)")
                    .font(.system(size: moreFontSize, weight: .bold))
                    .foregroundStyle(isToday ? .white : theme.mutedText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .truncationMode(.tail)
                    .frame(height: moreIndicatorHeight)
            } else if visibleItems.isEmpty {
                Text(" ")
                    .font(.system(size: badgeFontSize))
                    .lineLimit(1)
            }
        }
        .padding(.vertical, range == "month" ? monthContentScale : 2)
        .padding(.horizontal, 2 * monthContentScale)
        .frame(height: cellHeight, alignment: .top)
        .frame(maxWidth: .infinity, alignment: .top)
        .background(isToday ? theme.primary : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8 * monthContentScale, style: .continuous))
    }

    private var maxVisibleItems: Int {
        if range == "fourDays" { return 2 }
        return calendarType == "work" ? 1 : 2
    }

    private var overflowCount: Int {
        if range == "fourDays" {
            return max(visibleItems.count - maxVisibleItems, 0)
        }
        if calendarType == "work" { return 0 }
        return max(visibleItems.count - maxVisibleItems, 0)
    }

    private var itemCount: Int {
        if range == "fourDays" { return visibleItems.count }
        if calendarType == "work" { return min(visibleItems.count, 1) }
        return visibleItems.count
    }

    private var visibleItems: [CalendarWidgetItem] {
        if range == "month" && !day.isCurrentMonth { return [] }
        return day.items
    }

    private var badgeFontSize: CGFloat {
        let size: CGFloat

        if range == "fourDays" {
            size = itemCount <= 1 ? 12 : itemCount == 2 ? 10 : 9
        } else if range == "twoWeeks" {
            size = itemCount <= 1 ? 9.5 : itemCount == 2 ? 9 : 8.5
        } else {
            size = itemCount <= 1 ? 9.5 : itemCount == 2 ? 9 : 8.5
        }

        return size * monthContentScale
    }

    private var moreFontSize: CGFloat {
        let size: CGFloat = range == "fourDays" ? 8.5 : 9
        return size * monthContentScale
    }

    private var memoFontSize: CGFloat {
        let size: CGFloat

        if range == "fourDays" {
            size = 10.5
        } else if range == "twoWeeks" {
            size = 8.5
        } else {
            size = 8
        }

        return size * monthContentScale
    }

    private var dateFontSize: CGFloat {
        let size: CGFloat

        if range == "fourDays" {
            size = itemCount <= 1 ? 11.5 : itemCount == 2 ? 10 : 8.5
        } else if range == "twoWeeks" {
            size = 8
        } else {
            size = 9
        }

        return size * monthContentScale
    }

    private var cellHeight: CGFloat {
        if let availableCellHeight { return availableCellHeight }
        if range == "fourDays" { return 54 }
        if range == "twoWeeks" { return 47 }
        return monthRows <= 5 ? 51 : 44
    }

    private var badgeVerticalPadding: CGFloat {
        if range == "fourDays" { return 0 }
        if hasWorkMemo { return 0.5 * monthContentScale }

        let padding: CGFloat = itemCount <= 1 ? 1.5 : itemCount == 2 ? 1 : 0
        return padding * monthContentScale
    }

    private var badgeHeight: CGFloat? {
        guard range == "fourDays" else { return nil }
        if itemCount <= 1 { return 18 }
        if itemCount == 2 { return 14 }
        return 12
    }

    private var moreIndicatorHeight: CGFloat? {
        range == "fourDays" ? 9 : nil
    }

    private var itemSpacing: CGFloat {
        let spacing: CGFloat

        if hasWorkMemo {
            spacing = 1
        } else if range == "fourDays" {
            spacing = itemCount <= 1 ? 4 : itemCount == 2 ? 2 : 1
        } else if range == "twoWeeks" {
            spacing = itemCount >= 3 ? 1 : 2
        } else if itemCount >= 3 {
            spacing = 1
        } else {
            spacing = itemCount <= 1 ? 3 : 2
        }

        return spacing * monthContentScale
    }

    private var monthContentScale: CGFloat {
        guard range == "month", let availableCellHeight else { return 1 }
        return min(1, max(0, availableCellHeight) / 45)
    }

    private var dayNumberColor: Color {
        if isToday { return .white }
        return day.isCurrentMonth ? theme.text : theme.mutedText.opacity(0.55)
    }

    private var hasWorkMemo: Bool {
        let hasMemo = visibleItems.first.map { !workMemo(for: $0).isEmpty } == true
        if range == "fourDays" {
            return calendarType == "work" && itemCount == 1 && hasMemo
        }
        return calendarType == "work" && hasMemo
    }

    private var dayNumber: String {
        if range != "month", let weekday = day.weekday, !weekday.isEmpty {
            return "\(Int(day.date.suffix(2)) ?? 0) \(weekday)"
        }

        return String(Int(day.date.suffix(2)) ?? 0)
    }

    private func displayTitle(for item: CalendarWidgetItem) -> String {
        if let displayTitle = item.displayTitle, !displayTitle.isEmpty {
            return displayTitle
        }

        if calendarType == "work" {
            return item.categoryName.isEmpty ? item.title : item.categoryName
        }

        return item.title.isEmpty ? item.categoryName : item.title
    }

    private func workMemo(for item: CalendarWidgetItem) -> String {
        item.memo
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func textColor(for hex: String) -> Color {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else {
            return theme.secondary
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
                displayTitle: calendarType == "work" ? label : "일정",
                displayColor: calendarType == "work" ? "#fff6bf" : calendarType == "event" ? "#ffe0ef" : "#e7f6ff",
                title: "일정",
                memo: "",
                time: nil,
                sortOrder: 10,
                createdAt: nil
            ) : nil

            return CalendarWidgetDay(
                date: dateKey,
                weekday: koreanWeekdays[calendar.component(.weekday, from: date) - 1],
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
    .contentMarginsDisabled()
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
