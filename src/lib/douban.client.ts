import { DoubanItem, DoubanResult } from './types';

interface DoubanApiResponse {
  subjects: Array<{
    id: string;
    title: string;
    cover: string;
    rate: string;
  }>;
}

interface DoubanClientParams {
  type: 'tv' | 'movie';
  tag: string;
  pageSize?: number;
  pageStart?: number;
}

/**
 * 浏览器端豆瓣数据获取函数
 */
export async function fetchDoubanDataClient(
  params: DoubanClientParams
): Promise<DoubanResult> {
  const { type, tag, pageSize = 16, pageStart = 0 } = params;

  // 验证参数
  if (!['tv', 'movie'].includes(type)) {
    throw new Error('type 参数必须是 tv 或 movie');
  }

  if (pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  // 处理 top250 特殊情况
  if (tag === 'top250') {
    return handleTop250Client(pageStart);
  }

  const target = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageSize}&page_start=${pageStart}`;

  try {
    const response = await fetchWithTimeout(target);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const doubanData: DoubanApiResponse = await response.json();

    // 转换数据格式
    const list: DoubanItem[] = doubanData.subjects.map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.cover,
      rate: item.rate,
    }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    throw new Error(`获取豆瓣数据失败: ${(error as Error).message}`);
  }
}

/**
 * 处理豆瓣 Top250 数据获取
 */
async function handleTop250Client(pageStart: number): Promise<DoubanResult> {
  const target = `https://movie.douban.com/top250?start=${pageStart}&filter=`;

  try {
    const response = await fetchWithTimeout(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // 获取 HTML 内容
    const html = await response.text();

    // 通过正则同时捕获影片 id、标题、封面以及评分
    const moviePattern =
      /<div class="item">[\s\S]*?<a[^>]+href="https?:\/\/movie\.douban\.com\/subject\/(\d+)\/"[\s\S]*?<img[^>]+alt="([^"]+)"[^>]*src="([^"]+)"[\s\S]*?<span class="rating_num"[^>]*>([^<]*)<\/span>[\s\S]*?<\/div>/g;
    const movies: DoubanItem[] = [];
    let match;

    while ((match = moviePattern.exec(html)) !== null) {
      const id = match[1];
      const title = match[2];
      const cover = match[3];
      const rate = match[4] || '';

      // 处理图片 URL，确保使用 HTTPS
      const processedCover = cover.replace(/^http:/, 'https:');

      movies.push({
        id: id,
        title: title,
        poster: processedCover,
        rate: rate,
      });
    }

    return {
      code: 200,
      message: '获取成功',
      list: movies,
    };
  } catch (error) {
    throw new Error(`获取豆瓣 Top250 数据失败: ${(error as Error).message}`);
  }
}

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 检查是否使用代理
  const proxyUrl = getDoubanProxyUrl();
  const finalUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;

  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(finalUrl, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const doubanProxyUrl = localStorage.getItem('doubanProxyUrl');
  return doubanProxyUrl && doubanProxyUrl.trim() ? doubanProxyUrl.trim() : null;
}

/**
 * 检查是否应该使用客户端获取豆瓣数据
 */
export function shouldUseDoubanClient(): boolean {
  return getDoubanProxyUrl() !== null;
}

/**
 * 统一的豆瓣数据获取函数，根据代理设置选择使用服务端 API 或客户端代理获取
 */
export async function getDoubanData(
  params: DoubanClientParams
): Promise<DoubanResult> {
  if (shouldUseDoubanClient()) {
    // 使用客户端代理获取（当设置了代理 URL 时）
    return fetchDoubanDataClient(params);
  } else {
    // 使用服务端 API（当没有设置代理 URL 时）
    const { type, tag, pageSize = 16, pageStart = 0 } = params;
    const response = await fetch(
      `/api/douban?type=${type}&tag=${tag}&pageSize=${pageSize}&pageStart=${pageStart}`
    );

    if (!response.ok) {
      throw new Error('获取豆瓣数据失败');
    }

    return response.json();
  }
}
