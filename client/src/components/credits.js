import Modal from "./modal";

export default function Credits(props) {
    return (
        <Modal onClose={props.onClose}>
            <h3 className="text-3xl text-center">
                Credits
            </h3>
            <div className="mt-3">
                <ul className="text-sm">
                    <li>Ball sound: <a className="text-blue-400"
                                       href="https://freesound.org/people/tymaue/sounds/79347/" target="_blank"
                                       rel="noreferrer noopener">https://freesound.org/people/tymaue/sounds/79347/</a><br />by <a
                        className="text-blue-400" href="https://freesound.org/people/tymaue" target="_blank"
                        rel="noreferrer noopener"><em>tymaue</em></a><br /><a className="block text-right text-blue-400"
                                                                             href="https://creativecommons.org/licenses/sampling+/1.0/"
                                                                             target="_blank" rel="noreferrer noopener">Sampling+
                        License</a></li>
                    <li>Firework sound: <a className="text-blue-400"
                                           href="https://freesound.org/people/lezaarth/sounds/260665/" target="_blank"
                                           rel="noreferrer noopener">https://freesound.org/people/lezaarth/sounds/260665/</a><br />by <a
                        className="text-blue-400" href="https://freesound.org/people/lezaarth" target="_blank"
                        rel="noreferrer noopener"><em>lezaarth</em></a><br /><a
                        className="block text-right text-blue-400"
                        href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank"
                        rel="noreferrer noopener">Creative Commons 0 License</a></li>
                    <li>Achievement sound: <a className="text-blue-400"
                                           href="https://freesound.org/people/FoolBoyMedia/sounds/352661/" target="_blank"
                                           rel="noreferrer noopener">https://freesound.org/people/FoolBoyMedia/sounds/352661/</a><br />by <a
                        className="text-blue-400" href="https://freesound.org/people/FoolBoyMedia" target="_blank"
                        rel="noreferrer noopener"><em>FoolBoyMedia</em></a><br /><a
                        className="block text-right text-blue-400"
                        href="https://creativecommons.org/licenses/by/3.0/" target="_blank"
                        rel="noreferrer noopener">Creative Commons Attribution License</a></li>
                </ul>
                <p className="text-sm text-gray-400 mt-2">Note: usage of these assets does <em>not</em> imply
                    endorsement by the author.</p>
            </div>
        </Modal>
    );
}