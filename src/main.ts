// HMR: always do a full page reload on any hot update so the app starts from
// a clean state (stage='upload', no stale element instances). The shim on
// customElements.define keeps Lit's @customElement decorator idempotent while
// the module is being re-evaluated before the reload kicks in.
if (import.meta.hot) {
  const original = customElements.define.bind(customElements)
  customElements.define = function (name, ctor, options) {
    if (customElements.get(name)) return
    return original(name, ctor, options)
  }
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}

import './styles.css'
import './components/wuti-app'
import './components/wuti-uploader'
import './components/wuti-editor'
import './components/wuti-player'
