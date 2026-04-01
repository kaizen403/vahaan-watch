/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * uses multistage ANPR.
 */

#include <iostream>

#include "../common/utils.hpp"

#include <carmen/AnprBuilder.hpp>
#include <carmen/MmrBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>
#include <carmen/Logger.hpp>


void onEventCallback(const cm::Event& e) {
    try {
        std::cout << "------------------------------------------------------" << std::endl;
        std::cout << "Timestamp: " << e.timestamp() << " ms" << std::endl;

        //Plate
        std::cout << "Plate text: " << e.vehicle().plate().text() << std::endl;
        std::cout << "Country: " << e.vehicle().plate().country() << std::endl;

        //MMR
        std::cout << "Make: " << e.vehicle().attributes().make() << std::endl;
        std::cout << "Model: " << e.vehicle().attributes().model() << std::endl;
        std::cout << "Color: " << colorRGBIntToString(e.vehicle().attributes().color()) << std::endl;
        std::cout << "Category: " << e.vehicle().attributes().category() << std::endl;

        std::cout << std::endl;

    } catch(const std::exception& e) {
        std::cout << "Exception in event callback " << e.what() << std::endl;
    } catch(...) {
        std::cout << "Exception in event callback" << std::endl;
    }
}


std::optional<int> anpr_stage_callback(const cm::anpr::StageCallbackParam& info) {
    std::cout << "stage callback" << std::endl;
    for(const auto& stage : info.stages) {
        std::cout << stage.plateTextUtf8 << " - " << stage.confidence << std::endl;
    }

    auto lastIndex = info.stages.size() - 1;
    auto& lastStage = info.stages[lastIndex];
    if(!lastStage.plateTextUtf8.empty() && ((lastStage.confidence>50) || info.wasLastStage)) {
        return lastIndex;
    }
    return std::nullopt;
}


void add_anpr(cm::video::StreamProcessorBuilder& builder, const char* stage1_region, const char* stage2_region) {
    cm::anpr::Anpr anpr = cm::anpr::AnprBuilder()
            .type(cm::anpr::AnprBuilder::Type::LOCAL) // use LOCAL_GO for CARMEN_GO engines
            .localConcurrencyLimit(1)
            .build();

    cm::anpr::AnprProfile anprProfile;
    anprProfile.stageCallback = anpr_stage_callback;
    anprProfile.stages.push_back(cm::anpr::AnprStage{stage1_region, std::nullopt, std::nullopt, {}});
    anprProfile.stages.push_back(cm::anpr::AnprStage{stage2_region, std::nullopt, std::nullopt, {}});
    auto anprProfileId = anpr.registerProfile(anprProfile);

    builder.anpr(anpr).anprProfileId(anprProfileId);
}


void add_mmr(cm::video::StreamProcessorBuilder& builder, const char* mmrRegion) {
    cm::mmr::Mmr mmr = cm::mmr::MmrBuilder()
            .type(cm::mmr::MmrBuilder::Type::LOCAL)
            .build();
    cm::mmr::MmrProfile mmrProfile{mmrRegion, std::nullopt};
    auto mmrProfileId = mmr.registerProfile(mmrProfile);
    builder.mmr(mmr);
    builder.mmrProfileId(mmrProfileId);
}


cm::video::StreamProcessor buildStreamProcessor(
        const char* stage1_region,
        const char* stage2_region,
        const char* streamUrl,
        const char* mmrRegion) {

    cm::video::StreamProcessorBuilder streamProcessorBuilder;
    streamProcessorBuilder
        .source(streamUrl)
        .name("Stream 1")
        .eventCallback(onEventCallback)
        .statusChangeCallback(commonStatusCallback)
        .roi({{0.0,  0.0},
              {0.95, 0.0},
              {0.95, 0.95},
              {0.0,  0.95}})
        .autoReconnect(true);

    add_anpr(streamProcessorBuilder, stage1_region, stage2_region);

    if(mmrRegion != nullptr && mmrRegion[0] != 0) {
        add_mmr(streamProcessorBuilder, mmrRegion);
    }

    return streamProcessorBuilder.build();
}


int main(int argc, const char** argv) {
    try {
        if(argc < 3) {
            std::cout << "Usage: " << argv[0] << "<region code 1st> <region code 2nd> <stream url / video file> [mmr-region]\n" << std::endl;

            //  Region code:
            //      See in Reference Manual: Region List
            //      For "mmr-region" you have to include the "mmr-" prefix like it appears in gxsd.dat (e.g.: "mmr-eur")
            //
            //  Stream url examples:
            //      "rtsp://username:password@192.168.1.2:8994"
            //      "http://192.168.1.2:9901/video.mjpeg"
            //  Video file example:
            //      "file:///C:\\video.mp4"

            return -1;
        }

        const char* stage1_region = argv[1];
        const char* stage2_region = argv[2];
        const char* streamUrl = argv[3];
        const char* mmrRegion = nullptr;
        if(argc >= 5) {
            mmrRegion = argv[4];
        }

        cm::log::GlobalLogger::setMinLevel(cm::log::LogLevel::WARNING);

        cm::video::StreamProcessor streamProcessor = buildStreamProcessor(stage1_region, stage2_region, streamUrl, mmrRegion);

        std::cout << "Please press 'q' then 'Enter' to stop stream processing." << std::endl;

        streamProcessor.start();

        while(std::cin.get() != 'q');

        streamProcessor.stop();

    } catch(const std::exception& e) {
        std::cout << e.what() << std::endl;
        return -1;
    }
    return 0;
}
