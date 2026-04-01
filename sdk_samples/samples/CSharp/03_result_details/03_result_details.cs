/**
 * CARMEN Video SDK
 *
 * @category    CSharp Sample
 * @package     CARMEN Video CSharp Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream.
 * This example shows the usage of configuration settings and event result structures in detail.
 * These result details are printed on the standard output.
 * The example also saves the images corresponding to the recognition events.
 */

using Carmen;
using Carmen.Log;
using Carmen.Anpr;
using Carmen.Mmr;
using Carmen.Video;

#if NET40 || NET46 || NET48
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
#else
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
#endif

class Sample03_result_details
{
    static void EventHandlerCallback(Event e)
    {
        try
        {
            using (e)
            {
                PrintEventData(e);
                SaveImageOfEvent(e);
                
                Console.WriteLine();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Exception in event callback. " + ex);
        }
    }

    static void Main(string[] args)
    {
        try
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Usage: <program name> <region code> <stream url / video file> [location]");

                //  Region code:
                //      See in Reference Manual: Region List
                //
                //  Stream url examples:
                //      "rtsp://username:password@192.168.1.2:8994"
                //      "http://192.168.1.2:9901/video.mjpeg"
                //  Video file example:
                //      "file:C:/video.mp4"

                Console.ReadKey();
                return;
            }

            String region = args[0];
            String streamUrl = args[1];

            GlobalLogger.SetLogCallback((message, level) => { Console.WriteLine("MyLog: " + message); });
            GlobalLogger.SetMinLevel(LogLevel.Warning);

            using Anpr.AnprBuilder anprBuilder = Anpr.Builder();
            using Anpr anpr = anprBuilder
                .Type(AnprType.Local) // use LocalGo for CARMEN_GO engines
                .LocalConcurrencyLimit(1)
                .Build();

            using Mmr.MmrBuilder mmrBuilder = Mmr.Builder();
            using Mmr mmr = mmrBuilder
                .Type(MmrType.Local)
                .Build();

            using StreamProcessor.StreamProcessorBuilder streamProcessorBuilder = StreamProcessor.Builder();
            streamProcessorBuilder
                .Source(streamUrl)
                .Region(region)
                .Name("Stream 1");

            if (args.Length > 2)
            {
                streamProcessorBuilder.Location(args[2]);
            }

            using StreamProcessor stream = streamProcessorBuilder
                .EventCallback(EventHandlerCallback)
                .StatusChangeCallback(Utils.CommonStatusCallback)
                .OnFrameCallback
                (
                    (frame) =>
                    {
                        // THIS CALLBACK IS CALLED FOR EVERY DECODED FRAME
                        try
                        {
                            // Console.WriteLine("--- Image: " + frame.ImageInfo.Index + " ---");
                            // using (var fileStream = new System.IO.FileStream("frame.jpeg", System.IO.FileMode.Create))
                            // {
                            //     var image = frame.Image();
                            //
                            //     image.SaveImageToJpeg(fileStream);
                            //
                            //     image.Dispose();
                            // }
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("Exception in frame callback. " + ex);
                        }
                    }
                )
                .AnprColorRecognition(true)
                .MmrColorRecognition(true)
                .Anpr(anpr)
                .Mmr(mmr)
                .Roi(new List<Carmen.Point>
                {
                    new Carmen.Point(0.03, 0.01),
                    new Carmen.Point(0.93, 0.04),
                    new Carmen.Point(0.98, 0.96),
                    new Carmen.Point(0.05, 0.97)
                })
                .AutoReconnect(true)
                .EventTimeout(60000)
                .Build();

            Console.WriteLine("Please press 'q' then 'Enter' to stop stream processing.");

            stream.Start();

            while (Console.ReadLine() != "q");

            stream.Stop();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
        }

        Console.WriteLine("Please press a key to exit the program.");
        Console.ReadKey();
    }


    static void PrintPlateData(Plate plate)
    {
        Console.WriteLine("Plate text: " + plate.Text);
        Console.WriteLine("Country: " + plate.Country);
        Console.WriteLine("Category: " + plate.Category);
        Console.WriteLine("TextColor: " + plate.TextColor);
        Console.WriteLine("BgColor: " + plate.BgColor);
        Console.WriteLine("StripColor: " + plate.StripColor);
        Console.WriteLine("PlateSize: " + plate.PlateSize);
    }

    static void PrintPlateDetection(PlateDetection detection)
    {
        PrintPlateData(detection.Plate);

        Console.WriteLine("Plate frame: " + string.Join(" ", detection.Polygon));
        Console.WriteLine("Plate detection confidence: {0:N2}%", (detection.Confidence * 100));
    }

    static void PrintVehicleAttributes(MmrData vehicleAttributes)
    {
        Console.WriteLine("Make: " + vehicleAttributes.Make);
        Console.WriteLine("Model: " + vehicleAttributes.Model);
        Console.WriteLine("Color: " + vehicleAttributes.Color);
        Console.WriteLine("Category: " + vehicleAttributes.Category);
        Console.WriteLine("Viewpoint: " + vehicleAttributes.Viewpoint);
        Console.WriteLine("Body Type: " + vehicleAttributes.BodyType);
        Console.WriteLine("Generation: " + vehicleAttributes.Generation);
        Console.WriteLine("Variation: " + vehicleAttributes.Variation);
    }

    static void PrintMmrDetection(MmrDetection detection)
    {
        PrintVehicleAttributes(detection.MmrData);

        Console.WriteLine("Make confidence: {0:N2}%", (detection.MakeConfidence * 100));
        Console.WriteLine("Model confidence: {0:N2}%", (detection.ModelConfidence * 100));
        Console.WriteLine("Color confidence: {0:N2}%", (detection.ColorConfidence * 100));
        Console.WriteLine("Category confidence: {0:N2}%", (detection.CategoryConfidence * 100));
        Console.WriteLine("Viewpoint confidence: {0:N2}%", (detection.ViewpointConfidence * 100));
        Console.WriteLine("Body Type confidence: {0:N2}%", (detection.BodyTypeConfidence * 100));
        Console.WriteLine("Generation confidence: {0:N2}%", (detection.GenerationConfidence * 100));
        Console.WriteLine("Variation confidence: {0:N2}%", (detection.VariationConfidence * 100));
    }

    static void PrintImageAttributes(ImageProxy imageProxy)
    {
        Console.WriteLine("Image unix timestamp: " + imageProxy.ImageInfo.Timestamp + " ms (" + imageProxy.ImageInfo.DateTime.ToLocalTime() + ")");
        Console.WriteLine("Image index: " + imageProxy.ImageInfo.Index);
        Console.WriteLine("Image width: " + imageProxy.Width);
        Console.WriteLine("Image height: " + imageProxy.Height);
        Console.WriteLine("Image format: " + imageProxy.Format);

        Image image = imageProxy.Image();
        Console.WriteLine("Image width: " + image.Width);
        Console.WriteLine("Image height: " + image.Height);
        image.PrintPixelFormat();
    }

    static void PrintEventData(Event e)
    {
        Console.WriteLine("------------------------------------------------------");
        Console.WriteLine("Event arrived");
        Console.WriteLine("UUID: " + e.Uuid);
        Console.WriteLine("Channel: " + e.ChannelName);
        Console.WriteLine("Channel sessionId: " + e.ChannelSessionId);
        Console.WriteLine("Unix timestamp: " + e.Timestamp + " ms (" + e.DateTime.ToLocalTime() + ")");

        PrintPlateData(e.Vehicle.Plate);
        PrintVehicleAttributes(e.Vehicle.Attributes);

        Console.WriteLine("Event confidence: {0:N2}%", (e.Confidence * 100));

        Console.WriteLine("Plate detections count: " + e.PlateDetections.Count);

        foreach (Event.PlateOnImage p in e.PlateDetections)
        {
            PrintPlateDetection(p.Detection);
        }

        foreach (Event.MmrOnImage m in e.MmrDetections)
        {
            PrintMmrDetection(m.Detection);
        }

        if (e.Images.Count > 0)
        {
            Console.WriteLine("Frame 0 data:");
            PrintImageAttributes(e.Images[0]);
        }
    }

    static void SaveImageOfEvent(Event e)
    {
        string path = @"imagedir_csharp";
        Directory.CreateDirectory(path);

        string filename = path + "/" + e.DateTime.ToString("yyyy-MM-dd_HH-mm-ss-fff")
                          + "_" + e.Uuid + "_" + e.Vehicle.Plate.Text + "_"
                          + e.Vehicle.Plate.Country + ".jpeg";

        using (var fileStream = new System.IO.FileStream(filename, System.IO.FileMode.Create))
        {
            var image = e.Images[0].Image();

            image.SaveImageToJpeg(fileStream);
            
            image.Dispose();
        }
    }
}
