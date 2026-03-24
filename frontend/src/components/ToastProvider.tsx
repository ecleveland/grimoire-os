'use client';

import { Toaster } from 'sonner';

export default function ToastProvider() {
  return <Toaster position="top-right" duration={5000} closeButton richColors />;
}
