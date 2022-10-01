// prevent access of window object
//const window = null
const top = null
const parent = null
const frames = null
const self = null
const constructor = null
const content = null
const _content = null
const globalThis = null

// prevent network io
const fetch = null
const XMLHttpRequest = null
const WebSocket = null

// prevent addition of window listeners

// prevent local disk io
const localStorage = null
const sessionStorage = null
const indexedDB = null
const caches = null

// prevent manipulation of service worker
const navigator = null

// prevent redirection away from document
const location = null

// prevent form element network io
addEventListener("submit", (e) => {
    e.preventDefault()
})

// prevent routing of links away from document
// and file downloads
addEventListener("click", (e) => {
    const target = e.target || e.srcElement
    if (target.tagName === "A") {
        console.log("prevented download or link click")
        e.preventDefault()
    }
})

eval("console.log('win from eval', window)")

console.log(
    "w aliases:", 
    window, top, frames, parent, self, 
    globalThis, constructor, _content,
    content
)
console.log("fetch", fetch)

export const fn = () => 2