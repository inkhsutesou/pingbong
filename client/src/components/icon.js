import symbolDefs from '../assets/symbol-defs.svg';

export default function Icon(props) {
    const {name, className, tooltip, ...rest} = props;
    return (
        <svg {...rest} className={`icon fa-${name} ${className || ''}`}>
            {tooltip && (<title>{tooltip}</title>)}
            <use xlinkHref={`${symbolDefs}#fa-${name}`} />
        </svg>
    );
}
