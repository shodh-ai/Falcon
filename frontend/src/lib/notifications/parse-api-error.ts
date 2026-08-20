export type ParsedApiError = {
  title: string;
  message: string;
  category: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  intent: 'info' | 'action_required' | 'status_update' | 'alert';
};

const ROUTE_HINTS: Array<{
  pattern: RegExp;
  title: string;
  message: string;
  category: string;
}> = [
  {
    pattern: /profile\/photo|profile_photo|student\/profile/i,
    title: 'Could not update profile photo',
    message:
      'Photo upload did not complete. Use JPG, PNG, or WEBP under 5 MB. If the file is large, compress it and try again.',
    category: 'ACADEMICS',
  },
  {
    pattern: /export-job|document.*export|bulk.*export/i,
    title: 'Document export failed',
    message: 'The export could not be started or downloaded. Retry from the reports page.',
    category: 'HR',
  },
  {
    pattern: /helpdesk|ticket/i,
    title: 'Helpdesk action failed',
    message: 'Your ticket update could not be saved. Refresh and try again.',
    category: 'HELPDESK',
  },
  {
    pattern: /leave|gate.pass|workforce|team/i,
    title: 'Request could not be submitted',
    message: 'HR could not process this request right now. Check your pending list and retry.',
    category: 'HR',
  },
  {
    pattern: /timetable|adjustment|extra.class/i,
    title: 'Schedule change failed',
    message: 'The timetable request could not be saved. Review pending requests and try again.',
    category: 'ACADEMICS',
  },
  {
    pattern: /finance|fee|payment|receipt/i,
    title: 'Finance action failed',
    message: 'Payment or fee processing did not complete. Verify dues and try again.',
    category: 'FINANCE',
  },
  {
    pattern: /related.party|RELATED_PARTY_QUOTES|shared PAN/i,
    title: 'Related-party quotes blocked',
    message:
      'Two or more quotes share the same vendor PAN (GSTIN characters 3–12). Each quote must be from a genuinely different company — changing only the last GSTIN digit is not enough. Create a new PR and use three distinct GSTINs (e.g. 27AABCU9603R1ZM, 29AABCT1332L1ZV, 07AAACS4429R1ZR).',
    category: 'FINANCE',
  },
];

function matchRouteHint(raw: string): ParsedApiError | null {
  for (const hint of ROUTE_HINTS) {
    if (hint.pattern.test(raw)) {
      return {
        title: hint.title,
        message: hint.message,
        category: hint.category,
        severity: 'critical',
        intent: 'action_required',
      };
    }
  }
  return null;
}

/** Turn NestJS / fetch errors into audience-friendly notification copy. */
export function parseApiError(raw: string, fallbackTitle = 'Action could not be completed'): ParsedApiError {
  const text = raw.trim();
  if (!text) {
    return {
      title: fallbackTitle,
      message: 'Something went wrong. Please try again.',
      category: 'OPERATIONS',
      severity: 'critical',
      intent: 'alert',
    };
  }

  if (/413|payload too large|entity too large|request entity too large|status 413|too large to save/i.test(text)) {
    return {
      title: 'Photo or file is too large',
      message:
        'This upload exceeds the 5 MB limit. Choose a smaller JPG, PNG, or WEBP image, or compress the photo before uploading again.',
      category: 'ACADEMICS',
      severity: 'warning',
      intent: 'action_required',
    };
  }

  if (/profile photo must be 5|5 mb or smaller|5mb or smaller/i.test(text)) {
    return {
      title: 'Photo file is too large',
      message: 'Profile photos must be 5 MB or smaller. Compress your image or choose a smaller file.',
      category: 'ACADEMICS',
      severity: 'warning',
      intent: 'action_required',
    };
  }

  if (/profile photo must be jpg|invalid file type|jpg, png, or webp/i.test(text)) {
    return {
      title: 'Unsupported photo format',
      message: 'Use a JPG, PNG, or WEBP image for your profile photo.',
      category: 'ACADEMICS',
      severity: 'warning',
      intent: 'action_required',
    };
  }

  const cannotMethod = text.match(/^Cannot (GET|POST|PUT|PATCH|DELETE) (\S+)/i);
  if (cannotMethod) {
    const path = cannotMethod[2];
    const hinted = matchRouteHint(path);
    if (hinted) return hinted;
    return {
      title: 'Service temporarily unavailable',
      message:
        'This action could not reach the server endpoint. Ensure the backend is running and try again, or contact support if the problem persists.',
      category: 'OPERATIONS',
      severity: 'critical',
      intent: 'alert',
    };
  }

  if (/cannot reach api|failed to fetch|network|ECONNREFUSED/i.test(text)) {
    return {
      title: 'Cannot reach server',
      message:
        'Falcon could not connect to the API. Confirm the backend is running and your network is stable, then retry.',
      category: 'OPERATIONS',
      severity: 'critical',
      intent: 'alert',
    };
  }

  if (/^API \d{3}/.test(text)) {
    const status = Number(text.match(/^API (\d{3})/)?.[1] ?? 0);
    if (status === 401) {
      return {
        title: 'Sign in required',
        message: 'Your session may have expired. Sign in again and retry this action.',
        category: 'OPERATIONS',
        severity: 'warning',
        intent: 'action_required',
      };
    }
    if (status === 403) {
      return {
        title: 'Action not allowed',
        message: 'Your current role does not have permission for this action.',
        category: 'OPERATIONS',
        severity: 'warning',
        intent: 'action_required',
      };
    }
    if (status === 413) {
      return {
        title: 'Photo or file is too large',
        message:
          'This upload exceeds the 5 MB limit. Choose a smaller JPG, PNG, or WEBP image, or compress the photo before uploading again.',
        category: 'ACADEMICS',
        severity: 'warning',
        intent: 'action_required',
      };
    }
    if (status === 404) {
      const hinted = matchRouteHint(text);
      if (hinted) return hinted;
      return {
        title: 'Not found',
        message: 'The requested resource or action is not available. It may have moved or been removed.',
        category: 'OPERATIONS',
        severity: 'warning',
        intent: 'alert',
      };
    }
    if (status >= 500) {
      return {
        title: 'Server error',
        message: 'Something failed on our side. Wait a moment and try again.',
        category: 'OPERATIONS',
        severity: 'critical',
        intent: 'alert',
      };
    }
  }

  const hinted = matchRouteHint(text);
  if (hinted) return hinted;

  if (text.length <= 80) {
    return {
      title: text,
      message: '',
      category: 'OPERATIONS',
      severity: 'critical',
      intent: 'alert',
    };
  }

  return {
    title: fallbackTitle,
    message: text,
    category: 'OPERATIONS',
    severity: 'critical',
    intent: 'alert',
  };
}

/** Extract message string from API response body (JSON or plain text). */
export function extractApiErrorMessage(text: string, status: number, path?: string): string {
  if (!text.trim()) {
    if (status === 413) return 'Payload Too Large';
    return `Request failed with status ${status}`;
  }
  try {
    const errorData = JSON.parse(text) as { message?: string | string[]; error?: string };
    if (errorData.message) {
      return Array.isArray(errorData.message) ? String(errorData.message[0]) : String(errorData.message);
    }
    if (errorData.error) {
      const err = String(errorData.error);
      if (path && err === 'Not Found' && status === 404) {
        return `Cannot POST ${path}`;
      }
      return err;
    }
  } catch {
    // fall through
  }
  return text;
}
