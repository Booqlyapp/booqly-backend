import fs from 'fs/promises';
import path from 'path';

export class LocalFileStorage {
  private uploadDir = path.join(process.cwd(), 'uploads');

  /**
   * Ensure directory exists, create if it doesn't
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Save file buffer to local storage
   * @param buffer File buffer from multer
   * @param relativePath Relative path from uploads directory (e.g., 'profile-pics/user123.jpg')
   * @returns Full file path
   */
  async saveFile(buffer: Buffer, relativePath: string): Promise<string> {
    const fullPath = path.join(this.uploadDir, relativePath);
    const directory = path.dirname(fullPath);
    
    // Ensure directory exists
    await this.ensureDirectoryExists(directory);
    
    // Write file
    await fs.writeFile(fullPath, buffer);
    
    return relativePath;
  }

  /**
   * Delete file from local storage
   * @param relativePath Relative path from uploads directory
   */
  async deleteFile(relativePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.uploadDir, relativePath);
      await fs.unlink(fullPath);
      console.log(`Deleted file: ${relativePath}`);
    } catch (error) {
      console.error(`Failed to delete file ${relativePath}:`, error);
      // Don't throw error - file might already be deleted
    }
  }

  /**
   * Move/rename file
   * @param oldPath Old relative path
   * @param newPath New relative path
   * @returns New relative path
   */
  async moveFile(oldPath: string, newPath: string): Promise<string> {
    const oldFullPath = path.join(this.uploadDir, oldPath);
    const newFullPath = path.join(this.uploadDir, newPath);
    const newDirectory = path.dirname(newFullPath);
    
    // Ensure new directory exists
    await this.ensureDirectoryExists(newDirectory);
    
    // Move file
    await fs.rename(oldFullPath, newFullPath);
    
    return newPath;
  }

  /**
   * Get public URL for file
   * @param relativePath Relative path from uploads directory
   * @returns Public URL
   */
  getPublicUrl(relativePath: string): string {
    // Return the public URL for accessing the file
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/uploads/${relativePath}`;
  }

  /**
   * Check if file exists
   * @param relativePath Relative path from uploads directory
   * @returns Boolean indicating if file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.uploadDir, relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   * @param relativePath Relative path from uploads directory
   * @returns File stats or null if file doesn't exist
   */
  async getFileStats(relativePath: string): Promise<any> {
    try {
      const fullPath = path.join(this.uploadDir, relativePath);
      return await fs.stat(fullPath);
    } catch {
      return null;
    }
  }

  /**
   * Extract relative path from URL
   * @param url Public URL or relative path
   * @returns Relative path from uploads directory
   */
  extractRelativePath(url: string): string {
    if (url.startsWith('/uploads/')) {
      return url.replace('/uploads/', '');
    }
    
    // Handle full URLs
    if (url.includes('/uploads/')) {
      const parts = url.split('/uploads/');
      return parts[1] || '';
    }
    
    return url;
  }
}

// Create singleton instance
export const localFileStorage = new LocalFileStorage();
