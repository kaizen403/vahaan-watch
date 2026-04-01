project(cpp_sample_06_custom_stream)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 06_custom_stream.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
target_compile_definitions(${PROJECT_NAME} PRIVATE CMV_ENABLE_EXPERIMENTAL_FEATURES)
