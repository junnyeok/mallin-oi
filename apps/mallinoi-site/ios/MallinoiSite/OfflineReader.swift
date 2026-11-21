import SwiftUI

struct OfflineReader: View {
    @ObservedObject var library: OfflineLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var deleteFailed = false

    var body: some View {
        NavigationStack {
            Group {
                if library.articles.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "bookmark")
                            .font(.largeTitle)
                            .accessibilityHidden(true)
                        Text("저장한 글이 없어요").font(.headline)
                        Text("공개 게시글에서 ‘게시글 저장’을 눌러 주세요.")
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                } else {
                    List {
                        ForEach(library.articles) { article in
                            NavigationLink {
                                ScrollView {
                                    VStack(alignment: .leading, spacing: 16) {
                                        Text(verbatim: article.title)
                                            .font(.title2.bold())
                                            .accessibilityAddTraits(.isHeader)
                                        Text(verbatim: article.body)
                                            .textSelection(.enabled)
                                    }
                                    .frame(maxWidth: 680, alignment: .leading)
                                    .padding()
                                    .frame(maxWidth: .infinity)
                                }
                                .navigationTitle("저장된 글")
                                .navigationBarTitleDisplayMode(.inline)
                            } label: {
                                Text(verbatim: article.title)
                            }
                        }
                        .onDelete { offsets in
                            do { try library.remove(at: offsets) }
                            catch { deleteFailed = true }
                        }
                    }
                }
            }
            .navigationTitle("저장된 글")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    if !library.articles.isEmpty {
                        EditButton()
                    }
                }
            }
            .alert("저장된 글을 삭제하지 못했어요.", isPresented: $deleteFailed) {
                Button("확인", role: .cancel) {}
            }
        }
    }
}

struct OfflineSaveSheet: View {
    let id: Int64
    let library: OfflineLibrary
    @Environment(\.dismiss) private var dismiss
    @State private var message: String?
    @State private var succeeded = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let message {
                    Image(systemName: succeeded ? "checkmark.circle" : "exclamationmark.circle")
                        .font(.largeTitle)
                        .accessibilityHidden(true)
                    Text(message).multilineTextAlignment(.center)
                } else {
                    ProgressView("게시글을 저장하고 있어요.")
                }
            }
            .padding()
            .navigationTitle("오프라인에 저장")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(message == nil ? "취소" : "닫기") { dismiss() }
                }
            }
        }
        .task {
            guard message == nil else { return }
            do {
                let article = try await PublicPostService.load(id: id)
                try Task.checkCancellation()
                try library.save(article)
                succeeded = true
                message = "본문을 저장했어요. 전체서비스의 ‘저장된 글’에서 읽을 수 있어요."
            } catch is CancellationError {
                return
            } catch let error as OfflineSaveError {
                message = error.localizedDescription
            } catch {
                guard !Task.isCancelled else { return }
                message = "글을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
            }
        }
    }
}
