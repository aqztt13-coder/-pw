import { AdmissionRecord } from '../types/admission';

const TOKEN_KEY = 'dalilak_admin_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Public: Fetch confirmed admission records
 */
export async function fetchAdmissionRecords(): Promise<{
  success: boolean;
  records: AdmissionRecord[];
  count: number;
  lastUpdated: string | null;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admissions');
    if (!res.ok) throw new Error('فشل جلب البيانات من الخادم');
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('Error in fetchAdmissionRecords:', err);
    return {
      success: false,
      records: [],
      count: 0,
      lastUpdated: null,
      error: err.message,
    };
  }
}

/**
 * Admin Login
 */
export async function adminLogin(
  username: string,
  pass: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass }),
    });

    const data = await res.json();
    if (res.ok && data.success && data.token) {
      setStoredToken(data.token);
      return { success: true, token: data.token };
    }
    return { success: false, error: data.error || 'فشل تسجيل الدخول' };
  } catch (err: any) {
    return { success: false, error: 'حدث خطأ أثناء الاتصال بالخادم.' };
  }
}

/**
 * Admin Verify
 */
export async function adminVerify(): Promise<{ authenticated: boolean; username?: string }> {
  const token = getStoredToken();
  if (!token) return { authenticated: false };

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { authenticated: !!data.authenticated, username: data.username };
    }
    setStoredToken(null);
    return { authenticated: false };
  } catch (err) {
    return { authenticated: false };
  }
}

/**
 * Admin Logout
 */
export async function adminLogout(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  setStoredToken(null);
}

/**
 * Admin: Upload & Validate admission records permanently
 */
export async function uploadAdmissionRecords(records: any[]): Promise<{
  success: boolean;
  count: number;
  reviewCount: number;
  duplicateCount: number;
  lastUpdated?: string;
  error?: string;
}> {
  const token = getStoredToken();
  if (!token) {
    return {
      success: false,
      count: 0,
      reviewCount: 0,
      duplicateCount: 0,
      error: 'غير مصرح: يجب تسجيل الدخول كمدير أولاً.',
    };
  }

  try {
    const res = await fetch('/api/admin/upload-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ records }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        count: 0,
        reviewCount: 0,
        duplicateCount: 0,
        error: data.error || 'فشل حفظ واستيراد البيانات',
      };
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      reviewCount: 0,
      duplicateCount: 0,
      error: 'تعذر الاتصال بالخادم لحفظ البيانات.',
    };
  }
}

/**
 * Admin: Fetch full data summary including review records
 */
export async function fetchAdminDataSummary(): Promise<{
  success: boolean;
  count: number;
  reviewCount: number;
  duplicateCount: number;
  lastUpdated: string | null;
  reviewRecords: AdmissionRecord[];
  error?: string;
}> {
  const token = getStoredToken();
  if (!token) {
    return {
      success: false,
      count: 0,
      reviewCount: 0,
      duplicateCount: 0,
      lastUpdated: null,
      reviewRecords: [],
      error: 'غير مصرح',
    };
  }

  try {
    const res = await fetch('/api/admin/data-summary', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      reviewCount: 0,
      duplicateCount: 0,
      lastUpdated: null,
      reviewRecords: [],
      error: err.message,
    };
  }
}

/**
 * Admin: Clear data
 */
export async function deleteAdmissionRecords(): Promise<{ success: boolean; error?: string }> {
  const token = getStoredToken();
  if (!token) return { success: false, error: 'غير مصرح' };

  try {
    const res = await fetch('/api/admin/delete-data', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
