import Icon from "./icon";
import BlackOverlay from "./blackoverlay";

export default function Loading() {
    return (
        <div class="text-8xl z-10 fixed">
            <BlackOverlay />
            <div class="center">
                <Icon className="animate-spin-slow" name="hourglass" />
            </div>
        </div>
    );
}
