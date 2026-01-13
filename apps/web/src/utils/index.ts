import { useSearchParams } from 'react-router-dom';

export function createPageUrl(page: string): string {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  
  // Extract query params from page string if provided (e.g., "NewCalibration?scale_id=123")
  if (page.includes('?')) {
    const [path, query] = page.split('?');
    const pageParams = new URLSearchParams(query);
    pageParams.forEach((value, key) => {
      params.set(key, value);
    });
    return `/${path}${params.toString() ? `?${params.toString()}` : ''}`;
  }
  
  return `/${page}${params.toString() ? `?${params.toString()}` : ''}`;
}

// Helper function for creating page URLs without hooks (for use outside components)
export function createPageUrlStatic(page: string, queryParams?: Record<string, string>): string {
  const params = new URLSearchParams(queryParams);
  return `/${page}${params.toString() ? `?${params.toString()}` : ''}`;
}

