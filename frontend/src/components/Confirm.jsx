import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Modal } from './ui'

/** App-wide confirmation dialog (replaces window.confirm / window.prompt).
 *  const confirm = useConfirm()
 *  if (await confirm({ title, message, confirmLabel, danger })) ...
 *  const reason = await confirm({ title, input: { label, options: [...] , required: true } })  // string | false
 */
const Ctx = createContext(null)

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null)
  const [value, setValue] = useState('')
  const resolver = useRef(null)
  const confirm = useCallback((o) => new Promise((resolve) => {
    resolver.current = resolve
    setValue(o.input?.initial || '')
    setOpts(o)
  }), [])
  const close = (result) => { resolver.current?.(result); setOpts(null) }
  const needs = opts?.input?.required && !value.trim()
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && (
        <Modal title={opts.title || 'Are you sure?'} onClose={() => close(false)}>
          {opts.message && <p className="mt-0 text-[15px] text-[#2B3846]">{opts.message}</p>}
          {opts.input && (
            <div className="field">
              <label htmlFor="confirm-input">{opts.input.label}</label>
              {opts.input.options && (
                <div className="flex flex-wrap gap-2 mb-1">
                  {opts.input.options.map((o) => (
                    <button key={o} type="button" className={`btn btn-sm ${value === o ? 'btn-navy' : 'btn-outline'}`} onClick={() => setValue(o)}>{o}</button>
                  ))}
                </div>
              )}
              <input id="confirm-input" autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={opts.input.placeholder || ''}
                onKeyDown={(e) => e.key === 'Enter' && !needs && close(value.trim())} />
            </div>
          )}
          <div className="flex gap-2.5 justify-end mt-2">
            <button className="btn btn-ghost" onClick={() => close(false)}>{opts.cancelLabel || 'Cancel'}</button>
            <button className={`btn ${opts.danger ? 'btn-danger' : 'btn-navy'}`} disabled={needs} onClick={() => close(opts.input ? value.trim() : true)}>{opts.confirmLabel || 'Confirm'}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)
