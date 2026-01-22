export default function LateralBar() {
    return (
   <div className="w-14 bg-[#080c17] border-r border-[#252931] flex flex-col justify-between p-0">
          <div className="flex flex-col items-center w-full">
            <button className="w-full h-14 bg-transparent border-none border-l-2 border-transparent text-text-muted cursor-pointer flex items-center justify-center transition-all p-0 rounded-none hover:text-text active:text-text active:border-l-accent text-text border-l-accent">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
            <button className="w-full h-14 bg-transparent border-none border-l-2 border-transparent text-text-muted cursor-pointer flex items-center justify-center transition-all p-0 rounded-none hover:text-text">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </button>
            <button className="w-full h-14 bg-transparent border-none border-l-2 border-transparent text-text-muted cursor-pointer flex items-center justify-center transition-all p-0 rounded-none hover:text-text">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </button>
            <button className="w-full h-14 bg-transparent border-none border-l-2 border-transparent text-text-muted cursor-pointer flex items-center justify-center transition-all p-0 rounded-none hover:text-text">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="flex flex-col items-center w-full">
            <button className="w-full h-14 bg-transparent border-none border-l-2 border-transparent text-text-muted cursor-pointer flex items-center justify-center transition-all p-0 rounded-none hover:text-text">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </div>
    )
}