import Avatar from '../shared/Avatar';
import { useCandidatePhotoUrl } from '../../hooks/useCandidatePhotoUrl';

interface CandidateAvatarProps {
  candidateId: string;
  name?: string | null;
  photoUrl?: string;
  /** Changes whenever the photo does (e.g. the candidate's syncedAt) so a replace is picked up. */
  version?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export default function CandidateAvatar({ candidateId, name, photoUrl, version, size, className }: CandidateAvatarProps) {
  const objectUrl = useCandidatePhotoUrl(candidateId, photoUrl, version);
  return <Avatar name={name} size={size} className={className} imageUrl={objectUrl} />;
}
