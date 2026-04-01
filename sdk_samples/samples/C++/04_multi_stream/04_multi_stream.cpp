/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on multiple video streams.
 * There are "TODO" comments in the file where the code must be modified.
 */

#include <iostream>

#include "utils.hpp"

#include <carmen/AnprBuilder.hpp>
#include <carmen/MmrBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>

struct StreamConfig {
    std::string url;
    std::string region;
    std::string name;
};

//TODO: change them for valid streams and engines
StreamConfig streamConfigs[] = {
        {"http://192.168.6.50:9901/video.mjpeg",         "EUR", "Stream 1"},
        {"file:///C:\\Program Files\\videos\\video.mp4", "NAM", "Stream 2"}
};

//TODO: EventCallback is called from a StreamProcessor instance's dedicated "EventCallback executor" thread.
// If you are using the same resource in multiple StreamProcessors' EventCallback
// you may have to protect against race conditions
void onEventCallback(const cm::Event& e) {
    static std::mutex _eventCallbackMutex;
    std::lock_guard l{_eventCallbackMutex};
    try {
        std::cout << "------------------------------------------------------" << std::endl;
        std::cout << "Channel name: " << e.channelName() << std::endl;
        std::cout << "Unix timestamp: " << e.timestamp() << " ms" << std::endl;

        std::cout << "Plate text: " << e.vehicle().plate().text() << std::endl;
        std::cout << "Country: " << e.vehicle().plate().country() << std::endl;

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

int main(int argc, const char** argv) {
    try {
        // INITIALIZE COMMON ANPR OBJECT
        cm::anpr::Anpr anpr = cm::anpr::AnprBuilder()
                .type(cm::anpr::AnprBuilder::Type::LOCAL) // use LOCAL_GO for CARMEN_GO engines
                .localConcurrencyLimit(2) //TODO: change it to a value that matches the number of core licences you have
                .build();

        // INITIALIZE COMMON MMR (Make and Model Recognition) OBJECT
        cm::mmr::Mmr mmr = cm::mmr::MmrBuilder()
                .type(cm::mmr::MmrBuilder::Type::LOCAL)
                .build();

        // BUILD STREAM PROCESSOR OBJECTS THAT USE THE COMMON ANPR AND MMR RESOURCES
        std::vector<std::unique_ptr<cm::video::StreamProcessor>> streamProcessors;

        for(auto& streamConfig : streamConfigs) {
            std::unique_ptr<cm::video::StreamProcessor> stream =
                    std::make_unique<cm::video::StreamProcessor>(
                            cm::video::StreamProcessorBuilder()
                                    .source(streamConfig.url)
                                    .region(streamConfig.region)
                                    .name(streamConfig.name)
                                    .eventCallback(onEventCallback)
                                    .statusChangeCallback(commonStatusCallback)
                                    .anpr(anpr)
                                    .mmr(mmr)
                                    .roi({{0.0,  0.0},
                                          {0.95, 0.0},
                                          {0.95, 0.95},
                                          {0.0,  0.95}})
                                    .autoReconnect(true)
                                    .build()
                    );

            streamProcessors.push_back(std::move(stream));
        }

        std::cout << "Please press 'q' then 'Enter' to stop stream processing." << std::endl;

        // START STREAM PROCESSORS
        for(auto& streamProcessor : streamProcessors) {
            streamProcessor->start();
        }

        // STREAM PROCESSORS ARE NOW RUNNING ASYNCHRONOUSLY

        // WAIT FOR KEY 'q' FROM STANDARD INPUT
        while(std::cin.get() != 'q');

        // STOP STREAM PROCESSORS
        for(auto& streamProcessor : streamProcessors) {
            streamProcessor->stop();
        }

    } catch(const std::exception& e) {
        std::cout << e.what() << std::endl;
        return -1;
    }
    return 0;
}
