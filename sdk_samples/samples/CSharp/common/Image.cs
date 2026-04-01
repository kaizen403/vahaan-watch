#if NET40 || NET46 || NET48
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
#else
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
#endif

namespace Carmen
{
    public static class CustomImageProxy
    {
#if NET40 || NET46 || NET48
        public static Image Image(this ImageProxy proxy)
        {
            int width = proxy.Width;
            int height = proxy.Height;
            byte[] pixelData = proxy.convertToBGR24Data();

            // Create a new Bitmap with the specified dimensions and PixelFormat
            Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);

            // Lock the bitmap's bits
            BitmapData bmpData = bitmap.LockBits(new Rectangle(0, 0, width, height),
                                                 ImageLockMode.WriteOnly,
                                                 PixelFormat.Format24bppRgb);

            try
            {
                // Get the pointer to the bitmap's data
                IntPtr ptr = bmpData.Scan0;

                int bytesPerPixel = 3;
                int stride = bmpData.Stride;
                int srcStride = width * bytesPerPixel;

                int srcOffset = 0;
                int destOffset = 0;

                // Copy the pixel data into the bitmap row by row
                for (int y = 0; y < height; y++)
                {
                    Marshal.Copy(pixelData, srcOffset, ptr + destOffset, srcStride);
                    srcOffset += srcStride;
                    destOffset += stride;
                }
            }
            finally
            {
                // Unlock the bits
                bitmap.UnlockBits(bmpData);
            }

            return bitmap;
        }
#else
        public static Image Image(this ImageProxy proxy)
        {
            return SixLabors.ImageSharp.Image.LoadPixelData<Rgb24>(proxy.convertToRGB24Data(), proxy.Width, proxy.Height);
        }
#endif
        
        
        public static void SaveImageToJpeg(this Image image, System.IO.FileStream fileStream)
        {
#if NET40 || NET46 || NET48
            image.Save(fileStream, ImageFormat.Jpeg);
#else
            image.Save(fileStream, new JpegEncoder());
#endif
        }
        
        
        public static void PrintPixelFormat(this Image image)
        {
#if NET40 || NET46 || NET48
            Console.WriteLine($"PixelFormat: {image.PixelFormat}");
#else
            Console.WriteLine($"PixelType: {image.PixelType}");
#endif
        }
    }
}