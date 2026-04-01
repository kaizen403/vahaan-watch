#if NET40 || NET46 || NET48
using System.Runtime.InteropServices;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
#else
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
#endif
using Carmen;
using Carmen.Video;

namespace CustomStream;

public enum FileFormat
{
    JPEG
}

public class MyImage
{
    public int Width { get; private set; }
    public int Height { get; private set; }
    public List<Plane> Planes { get; private set; }
    public ImageProxy.PixelFormat Format { get; private set; }

    private MyImage(int width, int height, List<Plane> planes)
    {
        Width = width;
        Height = height;
        Planes = planes;
        Format = ImageProxy.PixelFormat.YUV420P;
    }

    public static MyImage Load(string filePath, FileFormat format)
    {
#if NET40 || NET46 || NET48
        if (format != FileFormat.JPEG)
            throw new NotSupportedException("Only JPEG format is supported.");

        // Load the image using System.Drawing
        using (Bitmap bitmap = new Bitmap(filePath))
        {
            if (bitmap.PixelFormat != PixelFormat.Format24bppRgb)
                throw new Exception("This sample only supports 24bpp RGB images.");

            int width = bitmap.Width;
            int height = bitmap.Height;

            // Lock the bitmap's bits
            Rectangle rect = new Rectangle(0, 0, width, height);
            BitmapData bmpData = bitmap.LockBits(rect, ImageLockMode.ReadOnly, bitmap.PixelFormat);

            try
            {
                int bytesPerPixel = 3;
                int stride = bmpData.Stride;
                int dataSize = stride * height;
                byte[] rgbData = new byte[dataSize];

                // Copy the RGB values into the array.
                Marshal.Copy(bmpData.Scan0, rgbData, 0, dataSize);

                // Convert RGB to YUV420P
                var yuvPlanes = ConvertRgbToYuv420P(rgbData, width, height, stride, ImagePixelFormat.BGR);

                return new MyImage(width, height, yuvPlanes);
            }
            finally
            {
                // Unlock the bits.
                bitmap.UnlockBits(bmpData);
            }
        }
#else
        if (format != FileFormat.JPEG)
            throw new NotSupportedException("Only JPEG format is supported.");

        // Load the image using ImageSharp
        using (var image = SixLabors.ImageSharp.Image.Load<Rgb24>(filePath))
        {
            int width = image.Width;
            int height = image.Height;

            // Get pixel data
            var rgbData = new byte[width * height * 3];
            image.CopyPixelDataTo(rgbData);

            // Convert RGB to YUV420P
            var yuvPlanes = ConvertRgbToYuv420P(rgbData, width, height, width * 3, ImagePixelFormat.RGB);

            return new MyImage(width, height, yuvPlanes);
        }
#endif
    }
    
    private enum ImagePixelFormat
    {
        RGB,
        BGR
    }

    private static byte ClampToByte(double value)
    {
        if (value < 0) return 0;
        if (value > 255) return 255;
        return (byte)value;
    }

    private static List<Plane> ConvertRgbToYuv420P(byte[] rgbData, int width, int height, int stride, ImagePixelFormat pixelFormat)
    {
        int frameSize = width * height;
        byte[] yPlane = new byte[frameSize];
        byte[] uPlane = new byte[frameSize / 4];
        byte[] vPlane = new byte[frameSize / 4];

        for (int j = 0; j < height; j++)
        {
            for (int i = 0; i < width; i++)
            {
                int rgbIndex = j * stride + i * 3;

                byte r, g, b;

                if (pixelFormat == ImagePixelFormat.RGB)
                {
                    r = rgbData[rgbIndex];
                    g = rgbData[rgbIndex + 1];
                    b = rgbData[rgbIndex + 2];
                }
                else // PixelFormat.BGR
                {
                    b = rgbData[rgbIndex];
                    g = rgbData[rgbIndex + 1];
                    r = rgbData[rgbIndex + 2];
                }

                // Convert RGB to YUV
                int yIndex = j * width + i;
                yPlane[yIndex] = ClampToByte((0.257 * r) + (0.504 * g) + (0.098 * b) + 16);

                if (j % 2 == 0 && i % 2 == 0)
                {
                    int uvIndex = (j / 2) * (width / 2) + (i / 2);
                    uPlane[uvIndex] = ClampToByte((-0.148 * r) - (0.291 * g) + (0.439 * b) + 128);
                    vPlane[uvIndex] = ClampToByte((0.439 * r) - (0.368 * g) - (0.071 * b) + 128);
                }
            }
        }

        var planes = new List<Plane>
        {
            new Plane(yPlane, width),
            new Plane(uPlane, width / 2),
            new Plane(vPlane, width / 2)
        };

        return planes;
    }
}

public class Plane
{
    public byte[] Data { get; private set; }
    public int LineStep { get; private set; }

    public Plane(byte[] data, int lineStep)
    {
        Data = data;
        LineStep = lineStep;
    }
}


public class MyFrameAdapter : ICustomImageStreamFrame
{
    private readonly MyImage _image;
    private readonly long _index;
    private readonly ulong _timestamp;

    public MyFrameAdapter(MyImage image, long index, ulong timestamp)
    {
        _image = image;
        _index = index;
        _timestamp = timestamp;
    }

    public int Width => _image.Width;
    public int Height => _image.Height;
    public ImageProxy.PixelFormat PixelFormat => ImageProxy.PixelFormat.YUV420P;

    public byte[] PlaneData(int ix)
    {
        if (ix >= _image.Planes.Count)
            return null;
        return _image.Planes[ix].Data;
    }

    public int PlaneLineStep(int ix)
    {
        if (ix >= _image.Planes.Count)
            return 0;
        return _image.Planes[ix].LineStep;
    }

    public ulong CaptureTimestamp => _timestamp;
    public long FrameIndex => _index;
}

public class MyCustomImageStream : ICustomImageStream
{
    private readonly List<string> _fileList;
    private int _currentIx = 0;
    private bool _endReached = false;
    private int? _width = null;
    private int? _height = null;

    public MyCustomImageStream(List<string> fileList)
    {
        _fileList = fileList;
        if (_fileList.Count == 0)
        {
            Console.WriteLine("No files in file list.");
            _endReached = true;
        }
    }

    public ICustomImageStreamFrame GetFrame()
    {
        Thread.Sleep(20);

        while (!_endReached)
        {
            int fileIndex = _currentIx++;
            _currentIx %= _fileList.Count;
            if (_currentIx == 0)
            {
                _endReached = true;
            }
            var curFileName = _fileList[fileIndex % _fileList.Count];

            if (fileIndex % 100 == 0)
            {
                Console.WriteLine($"Progress index/all/percentage: {fileIndex + 1}/{_fileList.Count}/{100.0 * (fileIndex + 1) / _fileList.Count}%");
            }

            try
            {
                var image = MyImage.Load(curFileName, FileFormat.JPEG);

                if (image.Format != ImageProxy.PixelFormat.YUV420P)
                {
                    throw new Exception("This sample only supports YUV420P images.");
                }

                _width = image.Width;
                _height = image.Height;

                return new MyFrameAdapter(image, (long)fileIndex, (ulong)(fileIndex * 40));
            }
            catch (Exception e)
            {
                Console.WriteLine($"Loading file [{fileIndex + 1}/{_fileList.Count}] {Path.GetFileName(curFileName)} FAILED - {e.Message}");
            }
        }
        throw new Exception("GetFrame failed");
    }

    public int Width => _width ?? 0;
    public int Height => _height ?? 0;
    public ImageProxy.PixelFormat PixelFormat => ImageProxy.PixelFormat.YUV420P;
    public bool Good => !_endReached && _fileList.Count > 0;
    public bool Eof => _endReached;
}

public class MyStreamFactory : ICustomImageStreamFactory
{
    private readonly List<string> _fileList = new List<string>();

    public MyStreamFactory(string imageDir)
    {
        foreach (var dirEntry in Directory.EnumerateFiles(imageDir))
        {
            if ((File.GetAttributes(dirEntry) & FileAttributes.Directory) == FileAttributes.Directory)
            {
                continue;
            }
            _fileList.Add(dirEntry);
        }

        Console.WriteLine($"Number of files found in {imageDir}: {_fileList.Count}");

        _fileList.Sort((file1, file2) => string.Compare(Path.GetFileName(file1), Path.GetFileName(file2), StringComparison.Ordinal));
    }

    public ICustomImageStream Create()
    {
        return new MyCustomImageStream(_fileList);
    }
}