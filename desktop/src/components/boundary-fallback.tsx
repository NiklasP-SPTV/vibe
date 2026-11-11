import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useContext, useEffect } from 'react'
import { FallbackProps } from 'react-error-boundary'
import { ErrorModalContext } from '~/providers/error-modal'
import ErrorModal from './error-modal'

export function BoundaryFallback({ error }: FallbackProps) {
	const { setState } = useContext(ErrorModalContext)

	useEffect(() => {
		// An error in the first renders leaves the window hidden; show it so the error is seen.
		const currentWindow = getCurrentWebviewWindow()
		void currentWindow.show()
		void currentWindow.setFocus()
	}, [])
	return (
		<div>
			<ErrorModal setState={setState} state={{ open: true, log: `Boundary error:\n${String(error)}` }} />
		</div>
	)
}
