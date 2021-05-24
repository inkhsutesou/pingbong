import Modal from "./modal";
import {AchievementBlock} from "./achievement";
import {getHumanReadableAchievementArray} from "../achievement";

export default function AchievementPage(props) {
    return (
        <Modal wide onClose={props.onClose}>
            <h3 className="text-3xl text-center">
                Achievements
            </h3>
            <div className="mt-3 grid gap-4 grid-cols-1 md:grid-cols-2">
                {getHumanReadableAchievementArray().map(item => (
                    <AchievementBlock key={item.achievement.name} name={item.achievement.name} description={/*item.unlocked ? item.achievement.description : '???'*/item.achievement.description} unlocked={item.unlocked} />
                ))}
            </div>
        </Modal>
    );
}