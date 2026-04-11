import { Navigate, useSearchParams } from 'react-router-dom';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = typeof searchParams.get('session_id') === 'string' ? searchParams.get('session_id').trim() : '';
  const target = sessionId
    ? `/membership?stripe=success&session_id=${encodeURIComponent(sessionId)}`
    : '/membership';
  return <Navigate to={target} replace />;
}
