export default function BlackOverlay() {
    return (
        <div class="fixed inset-0 blur" aria-hidden="true">
            <div class="absolute inset-0 bg-black opacity-animate" />
        </div>
    );
}