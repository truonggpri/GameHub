import { Navigate, useSearchParams } from 'react-router-dom';

export default function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const sessionId = typeof searchParams.get('session_id') === 'string' ? searchParams.get('session_id').trim() : '';
  const target = sessionId
    ? `/membership?stripe=cancel&session_id=${encodeURIComponent(sessionId)}`
    : '/membership?stripe=cancel';
  return <Navigate to={target} replace />;
}
