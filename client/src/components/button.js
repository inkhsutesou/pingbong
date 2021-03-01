export default function Button(props) {
    const {children, color, className, ...others} = props;
    return (
        <button
            className={`
            bg-${color}-600
            hover:bg-${color}-500
            font-bold
            py-2 px-4
            text-sm
            md:text-base
            border-${color}-700
            rounded-md
            transition-all
            border-b-4
            hover:border-${color}-600 focus:ring-2 focus:ring-${color}-800 focus:ring-opacity-75
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:btn ${className ?? ''}`}
            {...others}
        >{children}</button>
    );
}