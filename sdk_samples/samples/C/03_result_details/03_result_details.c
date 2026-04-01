/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream.
 * This example shows the usage of configuration settings and event result structures in detail.
 * These result details are printed on the standard output.
 * The example also saves the images corresponding to the recognition events.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/AnprBuilder.h>
#include <carmen/MmrBuilder.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/Logger.h>
#include <carmen/CmError.h>

#ifdef WIN32
#include <windows.h>
#else
#include <sys/stat.h>
#endif

#ifndef WIN32
#ifndef _mkdir
    #define _mkdir(x) mkdir(x, 0777)
#endif
#endif


void onEventCallback(CM_EVENT* e, void* userdata);

void onStatusChangeCallback(CM_STREAM_PROCESSOR handle, enum CM_StreamProcessorStatus status, void* userdata){
    commonStatusCallback(handle, status);
};

void onFrameCallback(CM_IMAGE_PROXY* ip, void* userdata) {
    // THIS CALLBACK IS CALLED FOR EVERY DECODED FRAME
//     printf("--- Image: %" PRId64 " ---\n", ip->info.index);
//     fflush(stdout);

//    Image* image;
//    cm_imageProxyCloneImage(&image, ip);
//    cm_imageSave(image, "frame.jpg", JPEG);
//    cm_imageFree(image);

    cm_imageproxy_free(ip);
}


void log_func(const char* message, int message_size, int log_level, void* userdata) {
    printf("MY LOGGER [%d]: %s %s\n", log_level, message, (const char*)userdata);
}

void logger_cleanup_func(void* cleanup_info) {
    printf("MY LOGGER CLEANUP %s\n", (const char*)cleanup_info);
}

int main(int argc, char** argv) {

    if(argc < 3) {
        printf("Usage: %s <region code> <stream url / video file> [location]\n", argv[0]);

        //  Region code:
        //      See in Reference Manual: Region List
        //
        //  Stream url examples:
        //      "rtsp://username:password@192.168.1.2:8994"
        //      "http://192.168.1.2:9901/video.mjpeg"
        //  Video file example:
        //      "file:///C:\\video.mp4"

        return -1;
    }

    const char* region = argv[1];
    const char* streamUrl = argv[2];

	CM_LOG_CALLBACK_PARAMS logger;
    memset(&logger, 0, sizeof(logger));
    logger.userdata = "USERDATA"; // this pointer will be one of the parameters of every 'log_func' call
    logger.log_func = log_func;
    logger.cleanup_func = logger_cleanup_func;
    logger.cleanup_info = "CLEANUP_INFO"; // this pointer will be the parameter of the 'cleanup_func' callback
	cm_logger_set_default_log_callback(&logger);
    cm_logger_set_global_logger_min_level(CM_LOGGER_LEVEL_WARNING);

    CM_ANPR_BUILDER anprBuilder;
    memset(&anprBuilder, 0, sizeof(anprBuilder));
    cm_anprbuilder_create(&anprBuilder);
    cm_anprbuilder_set_type(anprBuilder, CM_ANPR_TYPE_LOCAL); // use CM_ANPR_TYPE_LOCAL_GO for CARMEN_GO engines
    cm_anprbuilder_set_local_concurrency_limit(anprBuilder, 1);

    CM_ANPR anpr;
    memset(&anpr, 0, sizeof(anpr));
    CHECK_CM_ERROR(cm_anprbuilder_build(anprBuilder, &anpr));
    cm_anprbuilder_free(anprBuilder);

    CM_MMR_BUILDER mmrBuilder;
    memset(&mmrBuilder, 0, sizeof(mmrBuilder));
    cm_mmrbuilder_create(&mmrBuilder);
    cm_mmrbuilder_set_type(mmrBuilder, CM_MMR_TYPE_LOCAL);

    CM_MMR mmr;
    memset(&mmr, 0, sizeof(mmr));
    CHECK_CM_ERROR(cm_mmrbuilder_build(mmrBuilder, &mmr));
    cm_mmrbuilder_free(mmrBuilder);

    CM_STREAM_PROCESSOR_BUILDER builder;
    memset(&builder, 0, sizeof(builder));
    cm_streamprocessorbuilder_create(&builder);

    cm_streamprocessorbuilder_set_source(builder, streamUrl);
    cm_streamprocessorbuilder_set_region(builder, region);
    cm_streamprocessorbuilder_set_name(builder, "Stream 1");

    if(argc > 3) {
        cm_streamprocessorbuilder_set_location(builder, argv[3]);
    }

    cm_streamprocessorbuilder_set_event_callback(builder, onEventCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_status_change_callback(builder, onStatusChangeCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_onframe_callback(builder, onFrameCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_anpr(builder, anpr);
    cm_streamprocessorbuilder_set_mmr(builder, mmr);
    cm_streamprocessorbuilder_set_anpr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_mmr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_auto_reconnect(builder, CM_TRUE);
	cm_streamprocessorbuilder_set_event_timeout(builder, 60000);

    CM_POINT points[] = {
            {0.0,  0.0},
            {0.95, 0.0},
            {0.95, 0.95},
            {0.0,  0.95}
    };
    cm_streamprocessorbuilder_set_roi(builder, points, 4);

    CM_STREAM_PROCESSOR stream;
    memset(&stream, 0, sizeof(stream));
    CHECK_CM_ERROR(cm_streamprocessorbuilder_build(builder, &stream));
    cm_streamprocessorbuilder_free(builder);

	printf("Please press 'q' then 'Enter' to stop stream processing.\n");

    CHECK_CM_ERROR(cm_streamprocessor_start(stream));

    while(getc(stdin) != 'q');

    CHECK_CM_ERROR(cm_streamprocessor_stop(stream));

    cm_streamprocessor_free(stream);
    cm_anpr_free(anpr);
    cm_mmr_free(mmr);

    return 0;
}

void onEventCallback(CM_EVENT* e, void* userdata) {
    printf("------------------------------------------------------\n");
    printf("Event arrived\n");
    printf("UUID:  %s\n", e->uuid);
    printf("Channel: %s\n", e->channelName);
    printf("Channel sessionId: %s\n", e->channelSessionId);
    printf("Unix timestamp: %" PRId64 " ms\n", e->timestamp);

    CM_VEHICLE* v = e->vehicle;
    CM_PLATE* p = v->plate;
    printf("Plate text: %s\n", p->text);
    printf("Country: %s\n", p->country);
    printf("Category: %s\n", p->category);
    printf("TextColor: ");
    printOptionalColorRGB(&p->textColor);
    printf("\n");
    printf("BgColor: ");
    printOptionalColorRGB(&p->bgColor);
    printf("\n");
    printf("StripColor: ");
    printOptionalColorRGB(&p->stripColor);
    printf("\n");
    printf("PlateSize: %d\n", p->plateSize);

    printf("Make: %s\n", v->mmrData->make);
    printf("Model: %s\n", v->mmrData->model);
    printf("Color: ");
    printOptionalColorRGB(&v->mmrData->color);
    printf("\n");
    printf("Category: %s\n", v->mmrData->category);

    printf("Event confidence: %.2f%%\n", e->confidence * 100.0f);

    printf("Plate detections count: %d\n", e->numPlateDetections);

    for(int i = 0; i < e->numPlateDetections; i++){
        CM_PLATE_DETECTION* plateDetection = &e->plateDetections[i].detection;
        CM_PLATE* plate = &plateDetection->plate;

        printf("Plate text: %s\n", plate->text);
        printf("Country: %s\n", plate->country);
        printf("Category: %s\n", plate->category);
        printf("TextColor: ");
        printOptionalColorRGB(&plate->textColor);
        printf("\n");
        printf("BgColor: ");
        printOptionalColorRGB(&plate->bgColor);
        printf("\n");
        printf("StripColor: ");
        printOptionalColorRGB(&plate->stripColor);
        printf("\n");
        printf("PlateSize: %d\n", plate->plateSize);

        printf("Plate frame: ");
        for(int j = 0; j < plateDetection->polygonSize; j++){
            printf("[%d;%d] ", (int)plateDetection->polygon[j].x, (int)plateDetection->polygon[j].y);
        }
        printf("\n");
        printf("Plate detection confidence: %.2f%%\n", plateDetection->confidence * 100.0f);
    }

    for(int i = 0; i < e->numMmrDetections; i++){
        CM_MMR_DETECTION* mmrDetection = &e->mmrDetections[i].detection;
        CM_MMR_DATA* mmrData = &mmrDetection->mmr;

        printf("Make: %s\n", mmrData->make);
        printf("Model: %s\n", mmrData->model);
        printf("Color: ");
        printOptionalColorRGB(&mmrData->color);
        printf("\n");
        printf("Category: %s\n", mmrData->category);
        printf("Color Name: %s\n", mmrData->colorName);
        printf("Viewpoint: %s\n", mmrData->viewpoint);
        printf("Body Type: %s\n", mmrData->bodyType);
        printf("Generation: %s\n", mmrData->generation);
        printf("Variation: %s\n", mmrData->variation);

        printf("Make confidence: %.2f%%\n", mmrDetection->makeConfidence * 100.0f);
        printf("Model confidence: %.2f%%\n", mmrDetection->modelConfidence * 100.0f);
        printf("Color confidence: %.2f%%\n", mmrDetection->colorConfidence * 100.0f);
        printf("Category confidence: %.2f%%\n", mmrDetection->categoryConfidence * 100.0f);
        printf("Viewpoint confidence: %.2f%%\n", mmrDetection->viewpointConfidence * 100.0f);
        printf("Body Type confidence: %.2f%%\n", mmrDetection->bodyTypeConfidence * 100.0f);
        printf("Generation confidence: %.2f%%\n", mmrDetection->generationConfidence * 100.0f);
        printf("Variation confidence: %.2f%%\n", mmrDetection->variationConfidence * 100.0f);
    }

    if(e->imagesSize != 0) {
        printf("Frame 0 data:\n");
        CM_IMAGE_PROXY* ip = &e->images[0];
        printf("Image unix timestamp: %" PRId64 " ms\n", ip->info.timestamp);
        printf("Image index: %" PRId64 "\n", ip->info.index);
        printf("Image width: %lu\n", ip->width);
        printf("Image height: %lu\n", ip->height);
        printf("Image format: %s\n", pixelFormatToString(ip->format));
        CM_IMAGE* image;
        cm_imageproxy_clone_image(&image, ip);
        printf("Image width: %lu\n", image->width);
        printf("Image height: %lu\n", image->height);
        printf("Image format: %s\n", pixelFormatToString(image->format));

//        CM_PLANE* planes = image->planes;
//        unsigned int planeSize = image->planeSize;
//
//        for(unsigned int i = 0; i < planeSize; i++) {
//            printf("Plane size: %lu\n", planes[i].size);
//            printf("Plane linestep: %lu\n", planes[i].linestep);
//        }

        _mkdir("imagedir_c");

        char buf[256];
        snprintf(buf, sizeof(buf), "%s/%" PRId64 "_%s_%s_%s.jpg", "imagedir_c", e->timestamp, e->uuid,
                 e->vehicle->plate->text, e->vehicle->plate->country);

        cm_image_save(image, buf, CM_FILE_FORMAT_JPEG);

        char buf1[256];
        snprintf(buf1, sizeof(buf), "%s/%" PRId64 "_%s_%s_%s.bmp", "imagedir_c", e->timestamp, e->uuid,
                 e->vehicle->plate->text, e->vehicle->plate->country);

        cm_image_save(image, buf1, CM_FILE_FORMAT_BMP);

        cm_image_free(image);
    }

    printf("\n");
    fflush(stdout);

    cm_event_free(e);
}
