import Icon from '../shared/Icon';
import { initials } from '../../utils/format';

interface PhotoPickerProps {
  imageUrl?: string | null;
  name?: string | null;
  onClick: () => void;
  loading?: boolean;
  size?: number;
}

// A circular avatar that reveals a pencil icon on hover, doubling as the
// button that opens the file picker — used wherever a candidate's photo can be set.
export default function PhotoPicker({ imageUrl, name, onClick, loading, size = 72 }: PhotoPickerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title="Change photo"
      style={{ width: size, height: size }}
      className="group relative shrink-0 overflow-hidden rounded-full bg-muted font-semibold text-foreground ring-1 ring-inset ring-border disabled:cursor-not-allowed"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xl">{initials(name)}</span>
      )}
      <span
        className={`absolute inset-0 flex items-center justify-center bg-black/50 text-white transition-opacity ${
          loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Icon name={loading ? 'upload' : 'edit'} size={20} />
      </span>
    </button>
  );
}
