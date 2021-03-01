import BlackOverlay from "./blackoverlay";
import Button from "./button";

export default function Modal(props) {
    return (
        <div class="fixed z-10 inset-0 overflow-y-auto shadow-lg">
            <div class="flex items-end justify-center min-h-screen pt-4 md:pt-0 px-4 md:pb-0 pb-20 text-center sm:block">
                <BlackOverlay />

                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class={`inline-block align-bottom rounded-lg text-left overflow-hidden shadow-xl transform transition-all  sm:align-middle ${props.wide ? 'max-w-4xl' : 'sm:max-w-lg'} sm:w-full`} role="dialog" aria-modal="true" aria-labelledby="modal-headline">
                    <div class="bg-gray-900 px-4 pt-2 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mt-3 sm:mt-0 sm:ml-4 sm:text-left w-full">
                                {props.children}
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-900 px-4 pb-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <Button color="red" type="button" className="mt-3 w-full inline-flex justify-center rounded-md shadow-sm sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" onClick={_e => props.onClose()}>
                            Dismiss
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}