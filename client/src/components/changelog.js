import Modal from "./modal";

export const CHANGELOG = {
    '0.9.10': (
        <>
            <li>Fixed copy URL when embedded</li>
        </>
    ),
    '0.9.9': (
        <>
            <li>Game back online</li>
            <li>Lobby fixes</li>
            <li>Added bots</li>
            <li>Fixed some collision clipping issues with high ping</li>
            <li>Always display achievement description</li>
            <li>UI tweaks</li>
        </>
    ),
    '0.9.8': (
        <>
            <li>Tweaked parameters</li>
            <li>Added achievements</li>
            <li>Improved Firefox performance</li>
        </>
    ),
    '0.9.7': (
        <li>First public test version</li>
    ),
};

export const LATEST_VERSION = Object.keys(CHANGELOG)[0];

export default function Changelog(props) {
    return (
        <Modal onClose={props.onClose}>
            <h3 className="text-3xl text-center">
                Changelog
            </h3>
            <div className="mt-3">
                {Object.keys(CHANGELOG).map((version, index) => {
                    return (
                        <div key={index}>
                            <h4 className={`text-xl ${index > 0 ? 'mt-2' : ''}`}>{version}</h4>
                            <ul className="text-sm list-disc list-inside">
                                {CHANGELOG[version]}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}