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
 * Only the most essential output field usages are shown in this example.
 */

using Carmen;
using Carmen.Log;
using Carmen.Anpr;
using Carmen.Mmr;
using Carmen.Video;

class Sample02_basic
{
    static void EventHandlerCallback(Event e)
    {
        try
        {
            using (e)
            {
                Console.WriteLine("------------------------------------------------------");
                Console.WriteLine("Unix timestamp: " + e.Timestamp + " ms (" + e.DateTime.ToLocalTime() + ")");
                Console.WriteLine();

                //Plate
                Console.WriteLine("Plate text: " + e.Vehicle.Plate.Text);
                Console.WriteLine("Country: " + e.Vehicle.Plate.Country);

                //MMR
                Console.WriteLine("Make: " + e.Vehicle.Attributes.Make);
                Console.WriteLine("Model: " + e.Vehicle.Attributes.Model);
                Console.WriteLine("Color: " + e.Vehicle.Attributes.Color);
                Console.WriteLine("Category: " + e.Vehicle.Attributes.Category);

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
                Console.WriteLine("Usage: <program name> <region code> <stream url / video file>");

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
            using StreamProcessor stream = streamProcessorBuilder
                .Source(streamUrl)
                .Region(region)
                .Name("Stream 1")
                .EventCallback(EventHandlerCallback)
                .StatusChangeCallback
                (
                    (stream1, status) =>
                    {
                        Utils.CommonStatusCallback(stream1, status);
                    }
                )
                .Anpr(anpr)
                .Mmr(mmr)
                .Roi(new List<Carmen.Point>
                    {
                        new Carmen.Point(0.03, 0.01),
                        new Carmen.Point(0.93, 0.04),
                        new Carmen.Point(0.98, 0.96),
                        new Carmen.Point(0.05, 0.97)
                    }
                )
                .AutoReconnect(true)
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
}
