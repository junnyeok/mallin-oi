import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(CalendarWidgetsPlugin())
        bridge?.registerPluginInstance(CompletionAudioSessionPlugin())
    }
}
