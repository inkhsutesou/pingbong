import Button from "../components/button";
import Icon from "../components/icon";
import {fixedRoute} from "../util";

export default function PrivacyPolicy(_props) {
    return (
        <>
            <div className="flex flex-row">
                <Button color="red" className="mr-2" onClick={_e => {
                    fixedRoute('/');
                }}><Icon name="chevron-left" /><span>Go back</span></Button>
            </div>
            <div className="mt-5">
                <h1 className="text-3xl mb-2">Privacy policy</h1>
                <p className="text-gray-400 text-sm mb-2">Effective date: 13th Feb 2021</p>
                <p>
                    When referring to this site or game ("us", "we", or "our"), this refers to the same service.
                    This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our service and the choices you have associated with that data.
                    This game is provided as a free service with no cost and is intended for use as is.
                </p>
                <h2 className="text-2xl my-2">Usage data</h2>
                <p>
                    Our server logs very basic information (access log) about each device connecting to the game, this includes IP address and browser user agent string, it does not include your chosen nickname.
                    This information does not contain any personally identifiable information, but it could be possibly tied to you if we are required to disclose these logs as a result of a legal process.
                    These server logs entries are only stored for a time period of 14 days.
                    We do not store any personally identifiable information about the user.
                </p>
                <h2 className="text-2xl my-2">Tracking, cookies and local storage</h2>
                <p>
                    This game does not use cookies, but it does use <em>localStorage</em>, which is a browser feature that allows to store
                    data for the storing site only on the device of the user, and cannot be used to track users across different services.
                    The only data that we store in localStorage, is the nickname you provide, such that the game will fill this in automatically for you next time you open the game; and your unlocked achievements.
                    We do not share this data with anyone.
                </p>
                <h2 className="text-2xl my-2">Legal requirements</h2>
                <p>We may disclose your personal data in the good faith belief that such action is necessary to:</p>
                <ul className="list-disc list-inside ml-5 my-2">
                    <li>To comply with a legal obligation</li>
                    <li>To protect and defend our rights or property</li>
                    <li>To prevent or investigate possible wrongdoing in connection with the service</li>
                    <li>To protect the personal safety of users of the service or the public</li>
                    <li>To protect against legal liability</li>
                </ul>
                <h2 className="text-2xl my-2">Changes to this privacy policy</h2>
                <p>
                    We may update our privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page.
                    You are advised to review this privacy policy periodically for any changes. Changes to this privacy policy are effective when they are posted on this page.
                </p>
            </div>
        </>
    );
}
