import Modal from "./modal";

export default function Changelog(props) {
    return (
        <Modal onClose={props.onClose}>
            <h3 className="text-3xl text-center">
                Changelog
            </h3>
            <div className="mt-3">
                <h4 className="text-xl">0.9.8</h4>
                <ul className="text-sm list-disc list-inside">
                    <li>Tweaked parameters</li>
                    <li>Added achievements</li>
                    <li>Improved Firefox performance</li>
                </ul>
                <h4 className="text-xl mt-2">0.9.7</h4>
                <ul className="text-sm list-disc list-inside">
                    <li>First public test version</li>
                </ul>
            </div>
        </Modal>
    );
}