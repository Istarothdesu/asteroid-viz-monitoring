import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PlaybackToggle({ playing, disabled, onToggle }: {
  playing: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return <Button
    type="button"
    variant="hud"
    size="icon"
    disabled={disabled}
    onClick={onToggle}
    aria-label={playing ? '暂停（空格）' : '播放（空格）'}
    title="播放/暂停（空格）"
    className="rounded-full border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/25"
  >{playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}</Button>
}
