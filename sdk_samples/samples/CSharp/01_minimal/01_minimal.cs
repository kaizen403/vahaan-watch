/**
 * CARMEN Video SDK
 *
 * @category    CSharp Sample
 * @package     CARMEN Video CSharp Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/

 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) on a video stream.
 * Only the most essential configuration settings and output field usages are shown in this example.
 * The usage of vehicle make & model recognition feature is NOT shown in this example.
 */

using Carmen;
using Carmen.Anpr;
using Carmen.Video;

class Sample01_minimal
{
    static void EventHandlerCallback(Event e)
    {
        try
        {
            using (e)
            {
                Console.WriteLine("------------------------------------------------------");
                Console.WriteLine("Plate text: " + e.Vehicle.Plate.Text);
                Console.WriteLine("Country: " + e.Vehicle.Plate.Country);
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

            using Anpr.AnprBuilder anprBuilder = Anpr.Builder();
            using Anpr anpr = anprBuilder.Build();

            using StreamProcessor.StreamProcessorBuilder streamProcessorBuilder = StreamProcessor.Builder();
            using StreamProcessor stream = streamProcessorBuilder
                .Source(streamUrl)
                .Region(region)
                .Name("Stream 1")
                .Anpr(anpr)
                .EventCallback(EventHandlerCallback)
                .StatusChangeCallback(Utils.CommonStatusCallback) // may be omitted, the example only uses it for showing status changes
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
