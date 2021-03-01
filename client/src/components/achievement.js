import Icon from "./icon";

function AchievementInner(props) {
    return (
        <div className={`${props.className} p-2 shadow-sm bg-gray-800`}>
            <div className="flex flex-row">
                <div className="px-1">
                    <Icon name="trophy" className={`${props.colored ? 'text-yellow-400' : 'text-gray-400'} text-xl`} />
                </div>
                <div className="ml-2 mr-6">
                    <span className="font-semibold">{props.title}</span>
                    <span className="block text-gray-300">{props.description}</span>
                </div>
            </div>
        </div>
    );
}

export function AchievementBlock(props) {
    return (
        <AchievementInner colored={props.unlocked} title={props.name} description={props.description} className="rounded-md" />
    );
}

export function AchievementPopup(props) {
    return (
        <AchievementInner colored={true} title="Achievement unlocked!" description={props.name} className="rounded-tl-md rounded-bl-md border border-r-0 border-gray-700 achievement" />
    );
}
