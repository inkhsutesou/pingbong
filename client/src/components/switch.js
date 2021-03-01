export default function Switch(props) {
    return (
        <div class="relative inline-block w-10 mr-2 align-middle select-none">
            <input type="checkbox" id={props.id} name={props.id} className={`${props.className} disabled:opacity-50 disabled:cursor-not-allowed toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-gray-800 shadow-md appearance-none cursor-pointer`} disabled={props.disabled} checked={props.checked} onchange={_e => props.setChecked(!props.checked)} />
            <label for={props.id} className={`${props.disabled ? 'cursor-not-allowed ' : ''}toggle-label block overflow-hidden h-6 rounded-full bg-gray-800 transition-colors cursor-pointer`} />
        </div>
    );
}
