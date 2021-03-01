// tailwind.config.js
module.exports = {
    purge: {
        content: ['./src/**/*.js', './src/*.js'],
        // Options passed directly to PurgeCSS.
        options: {
            // List of classes to keep
            safelist: [
                'bg-blue-600', 'bg-red-600', 'bg-gray-600', 'bg-green-600',
                'hover:bg-blue-500', 'hover:bg-red-500', 'hover:bg-gray-500', 'hover:bg-green-500',
                'border-blue-700', 'border-red-700', 'border-gray-700', 'border-green-700',
                'hover:border-blue-600', 'hover:border-red-600', 'hover:border-gray-600', 'hover:border-green-600',
                'focus:ring-blue-800', 'focus:ring-red-800', 'focus:ring-gray-800', 'focus:ring-green-800',
            ],
        },
    },
    darkMode: false, // false or 'media' or 'class'
    theme: {
        extend: {},
    },
    variants: {
        extend: {
            cursor: ['disabled'],
            opacity: ['disabled'],
        },
    },
    plugins: [],
}