import { AdmissionRecord } from '../types/admission';

// Defensive cleanup for any legacy tokens stored in client storage
try {
  sessionStorage.removeItem('dalilak_admin_token');
  localStorage.removeItem('dalilak_admin_token');
} catch {}

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
 * Admin Login: Authenticates with server and receives HttpOnly Secure session cookie
 */
export async function adminLogin(
  username: string,
  pass: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password: pass }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'بيانات الدخول غير صحيحة.' };
  } catch (err: any) {
    return { success: false, error: 'حدث خطأ أثناء الاتصال بالخادم.' };
  }
}

/**
 * Admin Verify: Checks session state using HttpOnly cookie
 */
export async function adminVerify(): Promise<{ authenticated: boolean; username?: string }> {
  try {
    const res = await fetch('/api/auth/verify', {
      credentials: 'same-origin',
    });
    if (res.ok) {
      const data = await res.json();
      return { authenticated: !!data.authenticated, username: data.username };
    }
    return { authenticated: false };
  } catch (err) {
    return { authenticated: false };
  }
}

/**
 * Admin Logout: Invalidates server session and clears HttpOnly cookie
 */
export async function adminLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {}
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
  try {
    const res = await fetch('/api/admin/upload-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
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
  hasBackup?: boolean;
  hasPreRestoreSnapshot?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/data-summary', {
      credentials: 'same-origin',
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
  try {
    const res = await fetch('/api/admin/delete-data', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin: Restore from Disaster Recovery Backup
 */
export async function restoreAdminBackup(): Promise<{
  success: boolean;
  count?: number;
  message?: string;
  lastUpdated?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/restore-backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'تعذر الاتصال بالخادم لاستعادة النسخة الاحتياطية.' };
  }
}

/**
 * Admin: Rollback Restore (reverts to the snapshot taken immediately before the last restore)
 */
export async function rollbackAdminRestore(): Promise<{
  success: boolean;
  count?: number;
  message?: string;
  lastUpdated?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/rollback-restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'تعذر الاتصال بالخادم للتراجع عن الاستعادة.' };
  }
}
