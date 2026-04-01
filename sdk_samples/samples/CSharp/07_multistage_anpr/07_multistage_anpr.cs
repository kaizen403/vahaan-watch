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
 * uses multistage ANPR.
 */

using Carmen;
using Carmen.Log;
using Carmen.Anpr;
using Carmen.Mmr;
using Carmen.Video;

class Sample07_multistage_anpr
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

    static int? AnprStageCallback(Carmen.Anpr.StageCallbackParam info)
    {
        try
        {
            Console.WriteLine("stage callback");
            foreach (var stage in info.Stages)
            {
                Console.WriteLine(stage.PlateTextUtf8 + " - " + stage.Confidence);
            }

            int lastIndex = info.Stages.Count - 1;
            var lastStage = info.Stages[lastIndex];
            if (!string.IsNullOrEmpty(lastStage.PlateTextUtf8) && ((lastStage.Confidence > 50) || info.WasLastStage))
            {
                return lastIndex;
            }
            return null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Exception in AnprStageCallback callback. " + ex);
            return null;
        }
    }

    static void AddAnpr(StreamProcessor.StreamProcessorBuilder builder, string stage1Region, string stage2Region)
    {
        using Anpr.AnprBuilder anprBuilder = Anpr.Builder();
        using Anpr anpr = anprBuilder
            .Type(AnprType.Local) // use LocalGo for CARMEN_GO engines
            .LocalConcurrencyLimit(1)
            .Build();

        AnprProfile anprProfile = new AnprProfile();
        anprProfile.StageCallback = AnprStageCallback;
        var stage1 = new AnprStage(stage1Region, null, null, new Dictionary<string, string>());
        var stage2 = new AnprStage(stage2Region);
        anprProfile.Stages.Add(stage1);
        anprProfile.Stages.Add(stage2);
        AnprProfileId anprProfileId = anpr.RegisterProfile(anprProfile);

        builder.Anpr(anpr);
        builder.AnprProfileId(anprProfileId);
    }

    static void AddMmr(StreamProcessor.StreamProcessorBuilder builder, string mmrRegion)
    {
        using Mmr.MmrBuilder mmrBuilder = Mmr.Builder();
        using Mmr mmr = mmrBuilder
            .Type(MmrType.Local)
            .Build();

        MmrProfile mmrProfile = new MmrProfile(mmrRegion, null);
        var mmrProfileId = mmr.RegisterProfile(mmrProfile);

        builder.Mmr(mmr);
        builder.MmrProfileId(mmrProfileId);
    }

    static StreamProcessor BuildStreamProcessor(String stage1Region, String stage2Region, String streamUrl, String? mmrRegion)
    {
        using StreamProcessor.StreamProcessorBuilder streamProcessorBuilder = StreamProcessor.Builder();
        streamProcessorBuilder
            .Source(streamUrl)
            .Name("Stream 1")
            .EventCallback(EventHandlerCallback)
            .StatusChangeCallback
            (
                (stream1, status) => { Utils.CommonStatusCallback(stream1, status); }
            )
            .Roi(new List<Carmen.Point>
                {
                    new Carmen.Point(0.0, 0.0),
                    new Carmen.Point(0.95, 0.0),
                    new Carmen.Point(0.95, 0.95),
                    new Carmen.Point(0.0, 0.95)
                }
            )
            .AutoReconnect(true);

        AddAnpr(streamProcessorBuilder, stage1Region, stage2Region);

        if (!string.IsNullOrEmpty(mmrRegion))
        {
            AddMmr(streamProcessorBuilder, mmrRegion);
        }

        return streamProcessorBuilder.Build();
    }


    static void Main(string[] args)
    {
        try
        {
            if (args.Length < 3)
            {
                Console.WriteLine(
                    "Usage: <program name> <region code 1st> <region code 2nd> <stream url / video file> [mmr-region]");

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

            String stage1Region = args[0];
            String stage2Region = args[1];
            String streamUrl = args[2];
            String? mmrRegion = args.Length > 3 ? args[3] : null;

            GlobalLogger.SetMinLevel(LogLevel.Warning);

            using StreamProcessor stream = BuildStreamProcessor(stage1Region, stage2Region, streamUrl, mmrRegion);

            Console.WriteLine("Please press 'q' then 'Enter' to stop stream processing.");

            stream.Start();

            while (Console.ReadLine() != "q") ;

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