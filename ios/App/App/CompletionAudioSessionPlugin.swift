import AVFAudio
import Capacitor

@objc(CompletionAudioSessionPlugin)
public class CompletionAudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CompletionAudioSessionPlugin"
    public let jsName = "CompletionAudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "beginInterruption", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endInterruption", returnType: CAPPluginReturnPromise)
    ]

    private var isActive = false

    @objc func beginInterruption(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers, .duckOthers]
            )
            try session.setActive(true)
            isActive = true
            call.resolve(["active": true])
        } catch {
            isActive = false
            call.resolve([
                "active": false,
                "message": error.localizedDescription
            ])
        }
    }

    @objc func endInterruption(_ call: CAPPluginCall) {
        deactivateAndNotifyOtherAudio()
        call.resolve()
    }

    private func deactivateAndNotifyOtherAudio() {
        guard isActive else { return }
        isActive = false

        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        } catch {
            // 페이지 종료 중에도 외부 오디오 복원 시도 때문에 앱 종료를 막지 않는다.
        }
    }

    deinit {
        deactivateAndNotifyOtherAudio()
    }
}
